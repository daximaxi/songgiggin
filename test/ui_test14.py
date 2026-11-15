"""v4.1: share a setlist with a live link, no sign-in for the receiver; the PDF wordmark.
Mock Supabase follows schema.sql: records per owner (newer wins), shares per owner (RLS),
get_share(t) returns the setlist and its songs without the owner's notes, or null."""
import asyncio, json, uuid, subprocess, time, re
from urllib.parse import urlparse, parse_qs
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fixture  # the three example songs the tests were written against
from playwright.async_api import async_playwright

PORT = 8766
URL = 'http://localhost:%d/index.html' % PORT
SB = 'https://gqccejjjhayywtdkskxa.supabase.co'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json'}
db = {'records': {}, 'shares': {}, 'seq': 0, 'tokens': {}, 'pushed_ids': [], 'calls': []}

def session(uid, email):
    tok = 'jwt-' + uuid.uuid4().hex; db['tokens'][tok] = (uid, email)
    return tok

def who(hdr):
    return db['tokens'].get(hdr.get('authorization', '').replace('Bearer ', ''))

async def handle(route):
    req = route.request
    if req.method == 'OPTIONS': return await route.fulfill(status=200, headers=CORS, body='')
    u = urlparse(req.url); path = u.path; q = parse_qs(u.query)
    hdr = {k.lower(): v for k, v in req.headers.items()}
    body = json.loads(req.post_data) if req.post_data else None
    me = who(hdr)
    db['calls'].append((req.method, path, bool(me)))
    def ok(obj, status=200): return route.fulfill(status=status, headers=CORS, body=json.dumps(obj))
    if path == '/auth/v1/user':
        return await ok({'id': me[0], 'email': me[1]}) if me else await ok({'msg': 'bad jwt'}, 401)
    if path == '/rest/v1/rpc/push_records':
        if not me: return await ok({'message': 'not signed in'}, 401)
        for it in body['items']:
            k = (me[0], it['kind'], it['id']); cur = db['records'].get(k)
            db['pushed_ids'].append(it['id'])
            if not cur or cur['updated_at'] < it['updated_at']:
                db['seq'] += 1
                db['records'][k] = {'kind': it['kind'], 'id': it['id'], 'data': it['data'], 'updated_at': it['updated_at'], 'deleted': it.get('deleted', False), 'seq': db['seq']}
        return await ok(len(body['items']))
    if path == '/rest/v1/records':
        if not me: return await ok([])
        gt = int((q.get('seq', ['gt.0'])[0]).split('.')[1])
        rows = sorted([r for (o, _, _), r in db['records'].items() if o == me[0] and r['seq'] > gt], key=lambda r: r['seq'])
        return await ok(rows)
    if path == '/rest/v1/shares':
        if not me: return await ok({'message': 'permission denied'}, 401)
        if req.method == 'GET':
            sid = q['setlist_id'][0].split('.', 1)[1]
            return await ok([{'token': t} for t, s in db['shares'].items() if s['owner'] == me[0] and s['setlist_id'] == sid])
        if req.method == 'POST':
            if len(body['token']) < 20: return await ok({'message': 'check'}, 400)
            db['shares'][body['token']] = {'owner': me[0], 'setlist_id': body['setlist_id']}
            return await route.fulfill(status=201, headers=CORS, body='')
        if req.method == 'DELETE':
            tok = q['token'][0].split('.', 1)[1]
            if tok in db['shares'] and db['shares'][tok]['owner'] == me[0]: del db['shares'][tok]
            return await route.fulfill(status=204, headers=CORS, body='')
    if path == '/rest/v1/rpc/get_share':
        s = db['shares'].get(body['t'])
        if not s: return await ok(None)
        sl = db['records'].get((s['owner'], 'setlists', s['setlist_id']))
        if not sl or sl['deleted']: return await ok(None)
        ids = {it.get('songId') for it in sl['data'].get('items', [])}
        songs = []
        for (o, k, i), r in db['records'].items():
            if o == s['owner'] and k == 'songs' and i in ids and not r['deleted']:
                d = dict(r['data']); d.pop('notes', None); songs.append(d)
        return await ok({'setlist': sl['data'], 'songs': songs, 'mine': False})
    return await ok({'message': 'not mocked ' + path}, 404)

def frag(tok):
    return '#access_token=%s&refresh_token=r-%s&expires_in=3600&token_type=bearer&type=magiclink' % (tok, tok)

async def main():
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-d', '/home/claude/songgiggin/dist-pwa'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
            errs = []
            async def ctx_page():
                ctx = await b.new_context(viewport={'width': 1100, 'height': 860}, locale='is-IS', service_workers='block', accept_downloads=True)
                await ctx.route(SB + '/**', handle)
                await ctx.route('https://raw.githubusercontent.com/**', lambda r: r.fulfill(status=404, body=''))
                pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
                return ctx, pg

            # --- owner: not signed in -> asked to sign in
            A, pa = await ctx_page()
            await pa.goto(URL); await pa.wait_for_selector('.rows .row')
            await pa.click('#tab-setlists'); await pa.click('.listcard')
            await pa.click('#share-open')
            print('signed out:', (await pa.inner_text('.sharebox')).split('\n')[0][:60])
            await pa.keyboard.press('Escape')
            # sign in (link from the email) and share the example setlist
            ta = session('aaaaaaaa-0000-0000-0000-000000000001', 'eigandi@example.is')
            await pa.goto(URL + frag(ta)); await pa.wait_for_timeout(1500)
            print('owner signed in:', await pa.evaluate("!!localStorage.getItem('giggari.auth.v1')"))
            await pa.click('#tab-setlists'); await pa.click('.listcard')
            await pa.click('#share-open'); await pa.wait_for_selector('#share-make')
            await pa.screenshot(path='/home/claude/shots/v41-share-intro.png')
            await pa.click('#share-make'); await pa.wait_for_selector('#share-url', timeout=10000)
            url = await pa.input_value('#share-url')
            tok = url.split('#share/')[1]
            print('link:', url[:48] + '…', '| token length', len(tok), '| in db:', tok in db['shares'])
            print('examples went up with it:', sorted(r['id'] for r in db['records'].values()))
            await pa.screenshot(path='/home/claude/shots/v41-share-link.png')
            await pa.click('#share-copy'); await pa.wait_for_timeout(300)
            await pa.keyboard.press('Escape'); await pa.click('.btn.ghost >> text=Lagalistar')
            print('my list marked:', await pa.locator('.listcard .tag.shared').all_inner_texts())
            # owner's notes on a song must not travel: put some on the server copy
            k = ('aaaaaaaa-0000-0000-0000-000000000001', 'songs', 'ex-rising-sun')
            db['records'][k]['data']['notes'] = [{'id': 'n1', 'type': 'text', 'text': 'EINKA'}]

            # --- receiver: no sign-in, opens the link
            B, pb = await ctx_page()
            await pb.goto(URL); await pb.wait_for_selector('.rows .row')
            own_songs = await pb.locator('.rows .row').count()
            await pb.goto(url); await pb.wait_for_selector('.sharednote', timeout=10000)
            print('receiver opened:', await pb.inner_text('#setlist-name'), '| songs:', await pb.locator('.setsongs li').count(),
                  '| address:', pb.url.split('/')[-1])
            await pb.screenshot(path='/home/claude/shots/v41-receiver.png')
            print('read-only (no add/remove/move):', await pb.locator('.setsongs .acts').count(), await pb.locator('text=Bæta við lögum').count())
            # own key on song 1, a note on song 2 (stage)
            await pb.locator('.setsongs li').nth(0).locator('.keybox .iconbtn').nth(1).click()
            key1 = await pb.locator('.setsongs li').nth(0).locator('.k.cur b').inner_text()
            await pb.locator('.setsongs li').nth(1).locator('.open').click(); await pb.wait_for_selector('#stage')
            print('stage edit button hidden:', await pb.locator('#stage .stedit').count() == 0)
            print('owner notes shown:', await pb.locator('#stage .note').count())
            await pb.keyboard.press('Escape'); await pb.wait_for_timeout(200)
            await pb.click('#tab-songs')
            print('library unchanged:', await pb.locator('.rows .row').count() == own_songs)
            await pb.click('#tab-setlists')
            print('shared section:', await pb.locator('.group .grouphead').all_inner_texts())

            # --- owner changes the list (newer edit on the server): receiver gets it, keeps own key
            ks = ('aaaaaaaa-0000-0000-0000-000000000001', 'setlists', 'ex-gig')
            r = db['records'][ks]; d = dict(r['data']); d['name'] = 'Gigg á Rosenberg'; d['items'] = list(reversed(d['items']))
            db['seq'] += 1; db['records'][ks] = dict(r, data=d, updated_at=r['updated_at'] + 10, seq=db['seq'])
            await pb.click('.group .listcard'); await pb.click('#share-refresh'); await pb.wait_for_timeout(800)
            names = await pb.locator('.setsongs li .open b').all_inner_texts()
            print('after owner edit:', await pb.inner_text('#setlist-name'), '| order:', [n[:12] for n in names])
            last_key = await pb.locator('.setsongs li').nth(2).locator('.k.cur b').inner_text()
            print('own key kept:', key1, '==', last_key)

            # --- offline: kept copy opens from the link
            await B.route(SB + '/**', lambda r: r.abort())
            await pb.evaluate("location.hash = '#share/%s'" % tok); await pb.wait_for_timeout(800)
            print('offline:', await pb.locator('#toast').inner_text(), '|', await pb.inner_text('#setlist-name'))
            await B.unroute(SB + '/**'); await B.route(SB + '/**', handle)

            # --- receiver signs in: shared songs are never pushed to their account
            tb = session('bbbbbbbb-0000-0000-0000-000000000002', 'band@example.is')
            n0 = len(db['pushed_ids'])
            await pb.goto(URL + frag(tb)); await pb.wait_for_timeout(4500)
            pushed = db['pushed_ids'][n0:]
            print('receiver pushed', len(pushed), 'records, shared among them:', [i for i in pushed if i.startswith('x')])

            # --- PDF wordmark
            await pa.click('.listcard'); await pa.get_by_role('button', name='Prenta / PDF').click()
            async with pa.expect_download(timeout=20000) as dl:
                await pa.get_by_role('button', name='Sækja PDF').click()
            d = await dl.value; await d.save_as('/tmp/v41.pdf')
            await pa.keyboard.press('Escape')

            # --- owner stops sharing: link dead, receiver's copy goes away
            await pa.click('#share-open'); await pa.wait_for_selector('#share-stop'); await pa.click('#share-stop')
            await pa.click('#share-stop-yes'); await pa.wait_for_selector('#share-make')
            print('stopped, in db:', tok in db['shares'])
            await pb.click('#tab-setlists'); await pb.click('.group .listcard'); await pb.click('#share-refresh'); await pb.wait_for_timeout(800)
            print('receiver after stop:', await pb.locator('#toast').inner_text(), '| shared lists left:', await pb.locator('.group .listcard').count())
            C, pc = await ctx_page()
            await pc.goto(URL); await pc.wait_for_selector('.rows .row')
            await pc.goto(url); await pc.wait_for_timeout(1200)
            print('dead link:', await pc.locator('#toast').inner_text())
            print('ERRORS:', errs)
            await b.close()
    finally:
        srv.terminate()

asyncio.run(main())
