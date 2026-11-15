"""Copying a setlist (3.6), the app never fetching from GitHub (removed in 4.1.1), and what a
new device starts with (4.1.1: one example song on one example setlist)."""
import asyncio, json
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fixture  # the three example songs the tests were written against
from playwright.async_api import async_playwright
URL = 'file:///home/claude/songgiggin/dist/index.html'
DATA = "JSON.parse(localStorage.getItem('songgiggin.data.v1'))"
BUNDLE = {'format': 'giggari', 'version': 1, 'exportedAt': 0, 'tags': [],
          'songs': [{'id': 'f-1', 'title': 'Lag úr skrá', 'artist': 'Prófun', 'key': 'D', 'body': '[D]Halló [G]heimur', 'tags': [], 'updatedAt': 1000, 'createdAt': 1000}],
          'setlists': [{'id': 'f-l', 'name': 'Gigg úr skrá', 'date': '2026-12-01', 'items': [{'uid': 'i1', 'songId': 'f-1', 'tr': 2, 'acc': 'auto'}], 'createdAt': 1000, 'updatedAt': 1000}]}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        errs = []
        # a truly new device
        fixture.ENABLED = False
        ctx0 = await b.new_context(viewport={'width': 1100, 'height': 860}, locale='is-IS')
        gh = {'hits': 0}
        async def count(route): gh['hits'] += 1; await route.fulfill(status=404, body='')
        await ctx0.route('https://raw.githubusercontent.com/**', count)
        p0 = await ctx0.new_page(); p0.on('pageerror', lambda e: errs.append(str(e)))
        await p0.goto(URL); await p0.wait_for_selector('.rows .row'); await p0.wait_for_timeout(2500)
        print('new device songs:', await p0.locator('.rows .row b').all_inner_texts())
        await p0.click('#tab-setlists')
        print('new device setlists:', await p0.locator('.listcard b').all_inner_texts(), '| songs on it:', await p0.locator('.listcard small').first.inner_text())
        await p0.click('#btn-settings')
        print('no GitHub in settings:', await p0.locator('dialog >> text=GitHub').count() == 0, '| GitHub fetches:', gh['hits'])
        await ctx0.close()
        fixture.ENABLED = True

        # copy a setlist (brought in from a file)
        seed = json.loads(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'examples-v1.json'), encoding='utf-8').read())
        for x in BUNDLE['songs']: seed['songs'][x['id']] = x
        for x in BUNDLE['setlists']: seed['setlists'][x['id']] = x
        fixture.ENABLED = False
        ctx = await b.new_context(viewport={'width': 1100, 'height': 860}, locale='is-IS')
        fixture.ENABLED = True
        await ctx.add_init_script("if (!localStorage.getItem('songgiggin.data.v1')) localStorage.setItem('songgiggin.data.v1', %s)" % json.dumps(json.dumps(seed)))
        page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_selector('.rows .row')
        await page.click('#tab-setlists')
        await page.locator('.listcard', has_text='Gigg úr skrá').click()
        await page.get_by_role('button', name='Afrita', exact=True).click()
        await page.wait_for_timeout(300)
        name = await page.input_value('#setlist-name')
        d = await page.evaluate(DATA)
        cp = [s for s in d['setlists'].values() if s['name'].endswith('(afrit)')][0]
        print('copy:', name, '| date empty:', cp['date'] == '', '| items:', len(cp['items']), '| key kept:', cp['items'][0]['tr'] == 2,
              '| new item ids:', cp['items'][0]['uid'] != 'i1', '| toast:', await page.inner_text('#toast'))
        print('ERRORS:', errs)
        await b.close()

asyncio.run(main())
