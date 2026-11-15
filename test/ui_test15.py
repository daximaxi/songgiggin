"""v4.2: song lengths, start time, venue, breaks (list and stage), drag and number to reorder,
the stage clock, and Follow (the owner leads, the link follows). Mock Supabase as in ui_test14 plus
shares.live (owner only) and get_live(t).
Mock Supabase follows schema.sql: records per owner (newer wins), shares per owner (RLS),
get_share(t) returns the setlist and its songs without the owner's notes, or null."""
import asyncio, json, uuid, subprocess, time, re
from urllib.parse import urlparse, parse_qs
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fixture  # the three example songs the tests were written against
from playwright.async_api import async_playwright

PORT = 8767
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
    if path == '/rest/v1/rpc/get_live':
        s = db['shares'].get(body['t'])
        return await ok(s.get('live') if s else None)
    if path == '/rest/v1/shares' and req.method == 'PATCH':
        if not me: return await ok({'message': 'permission denied'}, 401)
        tok = q['token'][0].split('.', 1)[1]
        if tok in db['shares'] and db['shares'][tok]['owner'] == me[0]: db['shares'][tok]['live'] = body['live']
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
            async def ctx_page(w=1100):
                ctx = await b.new_context(viewport={'width': w, 'height': 860}, locale='is-IS', service_workers='block', accept_downloads=True)
                await ctx.route(SB + '/**', handle)
                pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
                return ctx, pg
            A, pa = await ctx_page()
            ta = session('aaaaaaaa-0000-0000-0000-000000000001', 'eigandi@example.is')
            await pa.goto(URL + frag(ta)); await pa.wait_for_timeout(1500)
            await pa.click('#tab-songs')
            # lengths in the editor
            for title, ln in [('Oh! Susanna', '2:30'), ('House of the Rising Sun', '4')]:
                await pa.locator('.rows .row', has_text=title).get_by_label('Breyta').click()
                await pa.fill('#ed-len', ln); await pa.press('#ed-len', 'Tab')
                await pa.get_by_role('button', name='Vista').first.click(); await pa.wait_for_timeout(300)
            print('pool shows length:', await pa.locator('.rows .row', has_text='Oh! Susanna').locator('.bpm').all_inner_texts())
            # setlist: start, venue, a break
            await pa.click('#tab-setlists'); await pa.click('.listcard')
            await pa.fill('#setlist-start', '21:00'); await pa.press('#setlist-start', 'Tab'); await pa.wait_for_timeout(200)
            await pa.fill('#setlist-place', 'Rosenberg, Reykjavík'); await pa.press('#setlist-place', 'Tab'); await pa.wait_for_timeout(200)
            await pa.click('#add-break'); await pa.wait_for_timeout(200)
            await pa.locator('.brkrow .brkmin input').fill('20'); await pa.locator('.brkrow .brkmin input').press('Tab'); await pa.wait_for_timeout(200)
            print('rows:', [x.replace('\n', ' ')[:40] for x in await pa.locator('.setsongs > li').all_inner_texts()])
            print('summary:', await pa.inner_text('#set-summary'))
            # drag the break to sit after song 1
            g = pa.locator('.brkrow .grip').bounding_box()
            gb = await g; t2 = await pa.locator('.setsongs li[data-uid]').nth(1).bounding_box()
            await pa.mouse.move(gb['x'] + 5, gb['y'] + 5); await pa.mouse.down()
            await pa.mouse.move(gb['x'] + 5, t2['y'] + 20, steps=8); await pa.mouse.move(gb['x'] + 5, t2['y'] + 6, steps=4); await pa.mouse.up()
            await pa.wait_for_timeout(300)
            print('after drag:', [x.split('\n')[1][:24] if x.startswith('⋮') else x[:30] for x in await pa.locator('.setsongs > li').all_inner_texts()])
            print('set lines:', await pa.locator('.settotal').all_inner_texts())
            # type a number: last song to number 1
            await pa.locator('.setsongs li[data-uid] .num').last.click()
            await pa.fill('.numin', '1'); await pa.press('.numin', 'Enter'); await pa.wait_for_timeout(300)
            print('after number:', [x.split('\n')[1][:24] if x.startswith('⋮') else x[:30] for x in await pa.locator('.setsongs > li').all_inner_texts()])
            print('no arrows:', await pa.locator('.setsongs [aria-label="Færa upp"]').count() == 0)
            await pa.screenshot(path='/home/claude/shots/v42-setlist.png', full_page=True)

            # stage: clock, break screen, timer, carry on
            await pa.click('text=Byrja'); await pa.wait_for_selector('#stage')
            print('clock:', await pa.inner_text('#stage-clock'), '| visible:', await pa.locator('#stage-clock').is_visible())
            await pa.click('#stage .nav.next'); await pa.click('#stage .nav.next'); await pa.wait_for_timeout(200)
            print('stage 3:', await pa.inner_text('#stage .sttitle'))
            await pa.screenshot(path='/home/claude/shots/v42-break.png')
            await pa.click('#brk-start'); await pa.wait_for_timeout(2200)
            print('timer:', await pa.inner_text('#brk-timer'))
            await pa.click('#brk-go'); await pa.wait_for_timeout(200)
            print('after break:', (await pa.inner_text('#stage .sttitle')).split('\n')[0])
            await pa.keyboard.press('Escape'); await pa.wait_for_timeout(200)
            # clock off in settings
            await pa.click('#btn-settings'); await pa.uncheck('#set-clock'); await pa.keyboard.press('Escape')
            await pa.click('text=Byrja'); await pa.wait_for_selector('#stage')
            print('clock hidden:', not await pa.locator('#stage-clock').is_visible())
            await pa.keyboard.press('Escape'); await pa.wait_for_timeout(200)
            await pa.click('#btn-settings'); await pa.check('#set-clock'); await pa.keyboard.press('Escape')

            # PDF overview
            await pa.get_by_role('button', name='Prenta / PDF').click()
            async with pa.expect_download(timeout=20000) as dl:
                await pa.get_by_role('button', name='Sækja PDF').click()
            d = await dl.value; await d.save_as('/tmp/v42.pdf'); await pa.keyboard.press('Escape')
            txt = subprocess.run(['pdftotext', '-l', '1', '/tmp/v42.pdf', '-'], capture_output=True, text=True).stdout
            print('pdf page 1:', [l for l in txt.split('\n') if l.strip()][:12])

            # Follow: share, the receiver opens the stage, the owner leads
            await pa.click('#share-open'); await pa.wait_for_selector('#share-make'); await pa.click('#share-make')
            await pa.wait_for_selector('#share-url', timeout=10000); url = await pa.input_value('#share-url'); await pa.keyboard.press('Escape')
            B, pb = await ctx_page(412)
            await pb.goto(URL); await pb.wait_for_selector('.rows .row')
            await pb.goto(url); await pb.wait_for_selector('.sharednote', timeout=10000)
            print('receiver sees:', await pb.inner_text('#set-summary'))
            print('receiver rows:', [x.split('\n')[1][:24] if x.startswith('⋮') else x[:30] for x in await pb.locator('.setsongs > li').all_inner_texts()])
            await pb.click('text=Byrja'); await pb.wait_for_selector('#stage'); await pb.wait_for_timeout(2500)
            print('follower button:', await pb.inner_text('#stage-lead'))
            await pa.click('text=Byrja'); await pa.wait_for_selector('#stage'); await pa.wait_for_timeout(800)
            print('owner button:', await pa.inner_text('#stage-lead'))
            await pa.click('#stage-lead'); await pa.wait_for_timeout(300)
            await pa.click('#stage .nav.next'); await pa.click('#stage .nav.next'); await pa.wait_for_timeout(300)
            owner_at = (await pa.inner_text('#stage .sttitle')).split('\n')[0]
            await pb.wait_for_timeout(3000)
            print('owner on:', owner_at, '| follower on:', (await pb.inner_text('#stage .sttitle')).split('\n')[0], '| follower button:', await pb.inner_text('#stage-lead'))
            await pb.screenshot(path='/home/claude/shots/v42-follower.png')
            # the follower stops following; the owner moves on; the follower stays
            await pb.click('#stage-lead'); await pa.click('#stage .nav.prev'); await pb.wait_for_timeout(3000)
            print('not following:', (await pb.inner_text('#stage .sttitle')).split('\n')[0], '| button:', await pb.inner_text('#stage-lead'))
            # follow again: catches up at once
            await pb.click('#stage-lead'); await pb.wait_for_timeout(3000)
            print('follow again:', (await pb.inner_text('#stage .sttitle')).split('\n')[0], '==', (await pa.inner_text('#stage .sttitle')).split('\n')[0])
            # the owner stops leading
            await pa.click('#stage-lead'); await pb.wait_for_timeout(3000)
            print('after owner stops:', await pb.inner_text('#stage-lead'))
            print('ERRORS:', errs)
            await b.close()
    finally:
        srv.terminate()

asyncio.run(main())
