import asyncio
from playwright.async_api import async_playwright
URL = 'file:///home/claude/songgiggin/dist/index.html'
LINE_AT = """(y) => { const els = [...document.querySelectorAll('#stage [data-bi]')];
  const el = els.find(e => { const r = e.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }) || els.find(e => e.getBoundingClientRect().top > y);
  return el ? el.getAttribute('data-k') : null; }"""

async def pinch(cdp, cx, cy, d0, d1, steps=8):
    pts = lambda d: [{'x': cx - d / 2, 'y': cy, 'id': 1}, {'x': cx + d / 2, 'y': cy, 'id': 2}]
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pts(d0)})
    for k in range(1, steps + 1):
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': pts(d0 + (d1 - d0) * k / steps)})
        await asyncio.sleep(0.03)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await asyncio.sleep(0.15)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 412, 'height': 860}, is_mobile=True, has_touch=True, locale='is-IS')
        page = await ctx.new_page(); errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        cdp = await ctx.new_cdp_session(page)
        await page.goto(URL); await page.wait_for_selector('.rows .row')
        await page.click('#tab-setlists'); await page.click('.listcard')
        await page.locator('.setsongs li .open').nth(2).click(); await page.wait_for_selector('#stage .sheet-body')
        await page.evaluate("document.getElementById('stage-sheet').scrollTop = 260")
        fs = lambda: page.evaluate("parseFloat(document.getElementById('stage-sheet').style.fontSize)")
        title = await page.inner_text('.sttitle b')
        cy = 500
        before = await page.evaluate(LINE_AT, cy)
        print('touch-action on sheet:', await page.evaluate("getComputedStyle(document.getElementById('stage-sheet')).touchAction"))
        print('font before:', await fs(), '| line under fingers:', before)
        await pinch(cdp, 206, cy, 100, 220)
        after = await page.evaluate(LINE_AT, cy)
        print('after pinch out: font', await fs(), '| line under fingers:', after, '| same line:', before == after)
        print('saved size:', await page.evaluate("JSON.parse(localStorage.getItem('songgiggin.prefs.v1')).fontSize"))
        print('lines fit the screen:', await page.evaluate("document.getElementById('stage-sheet').scrollWidth <= document.getElementById('stage-sheet').clientWidth"))
        await pinch(cdp, 206, cy, 240, 90)
        print('after pinch in: font', await fs(), '| line:', await page.evaluate(LINE_AT, cy))
        print('still the same song:', await page.inner_text('.sttitle b') == title)
        # two fingers moving together do not change the size
        f0 = await fs()
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 150, 'y': 600, 'id': 1}, {'x': 250, 'y': 600, 'id': 2}]})
        for k in range(1, 9):
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 150, 'y': 600 - k * 25, 'id': 1}, {'x': 252, 'y': 600 - k * 25, 'id': 2}]})
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        print('two-finger drag leaves size alone:', await fs() == f0)
        # notes mode: pinch still works, nothing gets drawn
        await page.get_by_role('button', name='Glósur', exact=True).click()
        await pinch(cdp, 206, 520, 100, 180)
        print('pinch in notes mode: font', await fs(), '| strokes drawn:', await page.evaluate("document.querySelectorAll('#stage .notes-svg g').length"))
        await page.get_by_role('button', name='Lokið').click()
        # PC: Ctrl + wheel
        f1 = await fs()
        await page.mouse.move(200, 500); await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control')
        await asyncio.sleep(0.2)
        print('ctrl+wheel: font', f1, '->', await fs())
        print('A+ still works:', end=' '); f2 = await fs(); await page.get_by_label('Stærra letur').click(); print(f2, '->', await fs())
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
