"""v4.0.1: sign in with the link from the email (the free Supabase plan sends a link, not a code).
Served over http so the app sends its own address as redirect_to. Covers: the link leads back to the
app with the session after # ; pasting the link from the email; pasting the address the link led to;
an expired link; another tab on the same device picks the session up."""
import asyncio, json, uuid, subprocess, time
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

PORT = 8765
URL = 'http://localhost:%d/index.html' % PORT
SB = 'https://gqccejjjhayywtdkskxa.supabase.co'
HASHES = {}      # token hash in the email link -> email
store = {'users': {}, 'tokens': {}, 'otp': [], 'verify': []}
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json'}

def new_session(email):
    uid = store['users'].setdefault(email, str(uuid.uuid4()))
    tok = 'jwt-' + uuid.uuid4().hex; store['tokens'][tok] = (uid, email)
    return {'access_token': tok, 'refresh_token': 'r-' + tok, 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'token_type': 'bearer'}

async def handle(route):
    req = route.request
    if req.method == 'OPTIONS': return await route.fulfill(status=200, headers=CORS, body='')
    u = urlparse(req.url); path = u.path
    hdr = {k.lower(): v for k, v in req.headers.items()}
    body = json.loads(req.post_data) if req.post_data else None
    def ok(obj, status=200): return route.fulfill(status=status, headers=CORS, body=json.dumps(obj))
    if path == '/auth/v1/otp':
        h = uuid.uuid4().hex; HASHES[h] = body['email']
        store['otp'].append({'email': body['email'], 'redirect_to': parse_qs(u.query).get('redirect_to', [None])[0], 'hash': h})
        return await ok({})
    if path == '/auth/v1/verify':
        store['verify'].append(body)
        h = body.get('token_hash')
        if h in HASHES and body.get('type') in ('magiclink', 'signup', 'email'):
            email = HASHES.pop(h); s = new_session(email); s['user'] = {'id': store['users'][email], 'email': email}
            return await ok(s)
        return await ok({'code': 403, 'error_code': 'otp_expired', 'msg': 'Email link is invalid or has expired'}, 403)
    if path == '/auth/v1/user':
        who = store['tokens'].get(hdr.get('authorization', '').replace('Bearer ', ''))
        return await ok({'id': who[0], 'email': who[1]}) if who else await ok({'msg': 'bad jwt'}, 401)
    if path.startswith('/rest/v1/records'): return await ok([])
    if path == '/rest/v1/rpc/push_records': return await ok(0)
    return await ok({'message': 'not mocked ' + path}, 404)

async def main():
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-d', '/home/claude/songgiggin/dist-pwa'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
            errs = []
            async def ctx_page():
                ctx = await b.new_context(viewport={'width': 1100, 'height': 860}, locale='is-IS', service_workers='block')
                await ctx.route(SB + '/**', handle)
                await ctx.route('https://raw.githubusercontent.com/**', lambda r: r.fulfill(status=404, body=''))
                pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
                return ctx, pg

            # 1. ask for the email: the app sends its own address
            A, pa = await ctx_page()
            await pa.goto(URL); await pa.wait_for_selector('.rows .row')
            await pa.click('#btn-settings')
            await pa.fill('#ac-email', 'dax@example.is'); await pa.click('#ac-send')
            await pa.wait_for_selector('#ac-code')
            print('redirect_to sent:', store['otp'][-1]['redirect_to'])
            print('send button / hint:', await pa.inner_text('.acset .hint'))
            await pa.screenshot(path='/home/claude/shots/v401-link.png', clip={'x': 0, 'y': 0, 'width': 1100, 'height': 520})

            # 2. paste the link from the email
            link = SB + '/auth/v1/verify?token=%s&type=magiclink&redirect_to=http://localhost:%d/' % (store['otp'][-1]['hash'], PORT)
            await pa.fill('#ac-code', 'nonsense'); await pa.click('#ac-verify')
            await pa.wait_for_selector('.acmsg'); print('nonsense pasted:', await pa.inner_text('.acmsg'))
            await pa.fill('#ac-code', link); await pa.click('#ac-verify')
            await pa.wait_for_selector('.acwho'); print('pasted link ->', await pa.inner_text('.acwho'), '| verify body:', store['verify'][-1])
            # the same link again fails (used)
            await pa.click('text=Skrá út')
            await pa.fill('#ac-email', 'dax@example.is'); await pa.click('#ac-send'); await pa.wait_for_selector('#ac-code')
            await pa.fill('#ac-code', link); await pa.click('#ac-verify')
            await pa.wait_for_selector('.acmsg'); print('used link again:', await pa.inner_text('.acmsg'))
            await A.close()

            # 3. the link opens the app: session after the # , address cleaned, email fetched
            B, pb = await ctx_page()
            s = new_session('band@example.is')
            frag = 'access_token=%s&expires_at=%d&expires_in=3600&refresh_token=%s&token_type=bearer&type=magiclink' % (s['access_token'], s['expires_at'], s['refresh_token'])
            await pb.goto(URL + '#' + frag); await pb.wait_for_selector('.rows .row')
            await pb.wait_for_timeout(800)
            print('address after link:', pb.url, '| saved session email:', await pb.evaluate("JSON.parse(localStorage.getItem('giggari.auth.v1')).user.email"))
            print('toast:', await pb.locator('#toast:not([hidden])').all_inner_texts())
            # another tab on the same device (the installed app) picks it up
            pb2 = await B.new_page(); pb2.on('pageerror', lambda e: errs.append(str(e)))
            await pb2.goto(URL); await pb2.wait_for_selector('.rows .row')
            await pb2.click('#btn-settings'); await pb2.click('text=Skrá út')
            await pb2.wait_for_selector('#ac-email')
            await pb.wait_for_timeout(300)
            print('tab 1 sees sign out:', await pb.evaluate("localStorage.getItem('giggari.auth.v1')") is None, await pb.inner_text('#sync-text'))
            await pb.click('#btn-settings'); await pb.wait_for_selector('#ac-email')
            s2 = new_session('band@example.is')
            frag2 = 'access_token=%s&expires_in=3600&refresh_token=%s&token_type=bearer&type=magiclink' % (s2['access_token'], s2['refresh_token'])
            await pb2.goto(URL + '#' + frag2); await pb2.wait_for_timeout(1000)
            await pb.wait_for_selector('.acwho', timeout=5000)
            print('tab 1 picked up sign-in from tab 2:', await pb.inner_text('.acwho'))
            # route still works after
            await pb2.goto(URL + '#setlists'); await pb2.wait_for_timeout(400)
            print('#setlists still routes:', await pb2.evaluate("location.hash"))
            await B.close()

            # 4. paste the address the link led to; and an expired link
            C, pc = await ctx_page()
            await pc.goto(URL); await pc.wait_for_selector('.rows .row')
            await pc.click('#btn-settings'); await pc.fill('#ac-email', 'x@example.is'); await pc.click('#ac-send'); await pc.wait_for_selector('#ac-code')
            s3 = new_session('x@example.is')
            await pc.fill('#ac-code', 'https://daximaxi.github.io/songgiggin/#access_token=%s&refresh_token=%s&expires_in=3600&type=magiclink' % (s3['access_token'], s3['refresh_token']))
            await pc.click('#ac-verify'); await pc.wait_for_selector('.acwho')
            print('pasted address ->', await pc.inner_text('.acwho'))
            await C.close()
            D, pd = await ctx_page()
            await pd.goto(URL + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
            await pd.wait_for_selector('.rows .row'); await pd.wait_for_timeout(1000)
            print('expired link toast:', await pd.locator('#toast:not([hidden])').all_inner_texts(), '| address:', pd.url)
            await D.close()
            print('ERRORS:', errs)
            await b.close()
    finally:
        srv.terminate()

asyncio.run(main())
