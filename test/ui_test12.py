"""v4.0: sign in with an email code and sync between two devices, against a mock Supabase
that follows the same rules as supabase/schema.sql (owner only, newer edit wins, change numbers)."""
import asyncio, json, re, uuid
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

URL = 'file:///home/claude/songgiggin/dist/index.html'
SB = 'https://gqccejjjhayywtdkskxa.supabase.co'
KEY = 'sb_publishable_3MY0DlJN4jGw1lkXjOw3Gg_l6crrI3T'
CODE = '48151623'

store = {'users': {}, 'tokens': {}, 'rows': {}, 'seq': 0, 'mails': [], 'bad_auth': []}
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json'}

async def handle(route):
    req = route.request
    if req.method == 'OPTIONS':
        return await route.fulfill(status=200, headers=CORS, body='')
    hdr = {k.lower(): v for k, v in req.headers.items()}
    if hdr.get('apikey') != KEY or 'sb_publishable' in hdr.get('authorization', ''):
        store['bad_auth'].append(req.url)
    u = urlparse(req.url); path = u.path
    body = json.loads(req.post_data) if req.post_data else None
    def ok(obj, status=200): return route.fulfill(status=status, headers=CORS, body=json.dumps(obj))
    if path == '/auth/v1/otp':
        store['mails'].append(body['email']); return await ok({})
    if path == '/auth/v1/verify':
        if body.get('token') != CODE or body.get('type') != 'email':
            return await ok({'code': 403, 'error_code': 'otp_expired', 'msg': 'Token has expired or is invalid'}, 403)
        uid = store['users'].setdefault(body['email'], str(uuid.uuid4()))
        tok = 'jwt-' + uuid.uuid4().hex; store['tokens'][tok] = uid
        return await ok({'access_token': tok, 'refresh_token': 'r-' + tok, 'expires_in': 3600, 'token_type': 'bearer', 'user': {'id': uid, 'email': body['email']}})
    if path == '/auth/v1/logout':
        return await route.fulfill(status=204, headers=CORS, body='')
    owner = store['tokens'].get(hdr.get('authorization', '').replace('Bearer ', ''))
    if path.startswith('/rest/') and not owner:
        return await ok({'message': 'JWT invalid'}, 401)
    if path == '/rest/v1/records' and req.method == 'GET':
        q = parse_qs(u.query); gt = int(q['seq'][0].split('.')[1]); lim = int(q['limit'][0])
        rows = sorted([r for (o, k, i), r in store['rows'].items() if o == owner and r['seq'] > gt], key=lambda r: r['seq'])[:lim]
        return await ok(rows)
    if path == '/rest/v1/rpc/push_records':
        for it in body['items']:
            key = (owner, it['kind'], it['id']); cur = store['rows'].get(key)
            store['seq'] += 1
            if cur and cur['updated_at'] >= it['updated_at']: continue
            store['rows'][key] = {'kind': it['kind'], 'id': it['id'], 'data': it['data'], 'updated_at': it['updated_at'], 'deleted': it['deleted'], 'seq': store['seq']}
        return await ok(len(body['items']))
    return await ok({'message': 'not mocked ' + path}, 404)

async def device(b, name):
    ctx = await b.new_context(viewport={'width': 1100, 'height': 860}, locale='is-IS')
    await ctx.route(SB + '/**', handle)
    await ctx.route('https://raw.githubusercontent.com/**', lambda r: r.fulfill(status=404, body=''))
    page = await ctx.new_page()
    errs = []; page.on('pageerror', lambda e: errs.append(name + ': ' + str(e)))
    await page.goto(URL); await page.wait_for_selector('.rows .row')
    return ctx, page, errs

async def sign_in(page, email, code=CODE):
    await page.click('#btn-settings')
    await page.fill('#ac-email', email); await page.click('#ac-send')
    await page.wait_for_selector('#ac-code')
    await page.fill('#ac-code', code); await page.click('#ac-verify')

def song_titles(page): return page.evaluate("[...document.querySelectorAll('.rows .row .open b')].map(b => b.textContent)")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        A, pa, ea = await device(b, 'A')
        B, pb, eb = await device(b, 'B')
        print('pill before sign in:', await pa.inner_text('#sync-text'))

        # wrong code first, then the right one
        await sign_in(pa, 'dax@example.is', '11111111')
        await pa.wait_for_selector('.acmsg')
        print('wrong code:', await pa.inner_text('.acmsg'))
        await pa.fill('#ac-code', CODE); await pa.click('#ac-verify')
        await pa.wait_for_selector('.acwho')
        print('A signed in:', await pa.inner_text('.acwho'), '| mails:', store['mails'])
        await pa.screenshot(path='/home/claude/shots/v40-account.png', clip={'x': 0, 'y': 0, 'width': 1100, 'height': 500})
        await pa.get_by_role('button', name='Lokið').click()

        # A: new song, it goes up on its own
        await pa.get_by_role('button', name='Nýtt lag').click()
        await pa.fill('#ed-title', 'Lag frá A'); await pa.fill('#ed-body', '[G]Halló [C]heimur')
        await pa.click('#ed-save')
        await pa.wait_for_timeout(4500)
        print('on server after save (no examples):', [r['data'].get('title') for r in store['rows'].values() if r['kind'] == 'songs'], '| pill:', await pa.inner_text('#sync-text'))

        # B signs in with the same email and gets it
        await sign_in(pb, 'dax@example.is')
        await pb.wait_for_selector('.acwho'); await pb.get_by_role('button', name='Lokið').click()
        await pb.wait_for_selector('.rows .row >> text=Lag frá A', timeout=8000)
        print('B got the song:', 'Lag frá A' in await song_titles(pb))

        # B edits it, A picks the edit up on the next sync
        await pb.locator('.rows .row', has_text='Lag frá A').get_by_label('Breyta').click()
        await pb.fill('#ed-title', 'Lag frá A, breytt á B'); await pb.click('#ed-save')
        await pb.wait_for_timeout(4500)
        await pa.click('#btn-settings'); await pa.get_by_role('button', name='Samstilla núna').click(); await pa.wait_for_timeout(800)
        await pa.get_by_role('button', name='Lokið').click(); await pa.wait_for_timeout(300)
        print('A sees the edit:', 'Lag frá A, breytt á B' in await song_titles(pa))

        # an older edit from A (made offline before) does not overwrite B's newer one
        await A.set_offline(True)
        await pa.locator('.rows .row', has_text='breytt á B').get_by_label('Setja í geymslu').click()
        await pa.wait_for_timeout(3500)
        print('A offline pill:', await pa.inner_text('#sync-text'))
        await A.set_offline(False)
        await pa.wait_for_timeout(2500)
        srv = [r for r in store['rows'].values() if r['kind'] == 'songs' and r['data'].get('title', '').startswith('Lag frá A')][0]
        print('archive reached the server after reconnect:', bool(srv['data'].get('archived')))
        await pb.click('#btn-settings'); await pb.get_by_role('button', name='Samstilla núna').click(); await pb.wait_for_timeout(800)
        await pb.get_by_role('button', name='Lokið').click(); await pb.wait_for_timeout(300)
        print('B: archived song left the pool:', 'Lag frá A, breytt á B' not in await song_titles(pb))

        # sign out
        await pb.click('#btn-settings'); await pb.get_by_role('button', name='Skrá út').click()
        print('B after sign out:', await pb.inner_text('#sync-text'), '| sign-in form back:', await pb.locator('#ac-email').count() == 1)
        print('requests with a wrong key header:', store['bad_auth'])
        print('ERRORS:', ea + eb)
        await b.close()

asyncio.run(main())
