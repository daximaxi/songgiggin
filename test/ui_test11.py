"""v3.6: songs from GitHub (data/library.json, read only) and copying a setlist."""
import asyncio, json
from playwright.async_api import async_playwright
URL = 'file:///home/claude/songgiggin/dist/index.html'
DATA = "JSON.parse(localStorage.getItem('songgiggin.data.v1'))"
BUNDLE = {'format': 'giggari', 'version': 1, 'exportedAt': 0, 'tags': [{'id': 'tg-x', 'name': 'Frá GitHub'}],
          'songs': [{'id': 'gh-1', 'title': 'Lag af GitHub', 'artist': 'Prófun', 'key': 'D', 'body': '[D]Halló [G]heimur', 'tags': ['tg-x'], 'updatedAt': 1000, 'createdAt': 1000}],
          'setlists': [{'id': 'gh-l', 'name': 'Gigg af GitHub', 'date': '2026-12-01', 'items': [{'uid': 'i1', 'songId': 'gh-1', 'tr': 2, 'acc': 'auto'}], 'createdAt': 1000, 'updatedAt': 1000}]}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1100, 'height': 860}, locale='is-IS')
        state = {'mode': 'ok', 'hits': 0}
        async def handle(route):
            state['hits'] += 1
            if state['mode'] == '404': await route.fulfill(status=404, body='404: Not Found')
            else: await route.fulfill(status=200, body=json.dumps(BUNDLE), headers={'access-control-allow-origin': '*'})
        await ctx.route('https://raw.githubusercontent.com/**', handle)
        page = await ctx.new_page()
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_selector('.rows .row')
        await page.wait_for_selector('.rows .row >> text=Lag af GitHub', timeout=6000)
        print('auto fetch at start:', state['hits'] == 1, '| toast:', await page.inner_text('#toast'))
        await page.click('#tab-setlists')
        print('setlist from GitHub:', await page.locator('.listcard', has_text='Gigg af GitHub').count() == 1)

        # copy a setlist
        await page.locator('.listcard', has_text='Gigg af GitHub').click()
        await page.get_by_role('button', name='Afrita', exact=True).click()
        await page.wait_for_timeout(300)
        name = await page.input_value('#setlist-name')
        d = await page.evaluate(DATA)
        cp = [s for s in d['setlists'].values() if s['name'].endswith('(afrit)')][0]
        print('copy:', name, '| date empty:', cp['date'] == '', '| items:', len(cp['items']), '| key kept:', cp['items'][0]['tr'] == 2,
              '| new item ids:', cp['items'][0]['uid'] != 'i1', '| toast:', await page.inner_text('#toast'))

        # delete the GitHub song for good on this device; the next fetch must not bring it back
        await page.click('#tab-songs')
        await page.locator('.rows .row', has_text='Lag af GitHub').get_by_label('Setja í geymslu').click()
        await page.locator('.archbtn').click()
        await page.locator('.archrow', has_text='Lag af GitHub').get_by_role('button', name='Eyða endanlega').click()
        await page.locator('dialog').get_by_role('button', name='Eyða endanlega').click()
        await page.wait_for_timeout(400)
        await page.click('#tab-songs'); await page.reload(); await page.wait_for_selector('.rows .row'); await page.wait_for_timeout(2500)
        print('deleted song stays deleted after fetch:', await page.locator('.rows .row', has_text='Lag af GitHub').count() == 0, '| fetches:', state['hits'])

        # settings: manual fetch and a missing file
        state['mode'] = '404'
        await page.click('#btn-settings')
        print('repo field:', await page.input_value('#gh-repo'))
        await page.get_by_role('button', name='Sækja lög núna').click()
        await page.wait_for_timeout(600)
        print('status:', await page.inner_text('.ghstatus'))
        await page.locator('.ghset').screenshot(path='/home/claude/shots/v36-gh.png')
        print('ERRORS:', errs)
        await b.close()

asyncio.run(main())
