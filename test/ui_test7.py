import asyncio, json, statistics
from playwright.async_api import async_playwright
URL = 'file:///home/claude/songgiggin/dist/index.html'
PEN = """([x0, y0, x1, p0, p1]) => { const l = document.querySelector('#stage .notes-layer');
  const ev = (type, x, p) => l.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'pen', pressure: p, clientX: x, clientY: y0, bubbles: true, cancelable: true }));
  ev('pointerdown', x0, p0); for (let k = 1; k <= 20; k++) ev('pointermove', x0 + (x1 - x0) * k / 20, p0 + (p1 - p0) * k / 20); ev('pointerup', x1, p1); }"""
NOTES = "JSON.parse(localStorage.getItem('songgiggin.data.v1')).songs['ex-amazing-grace'].notes"

async def zigzag(page, x, y):
    await page.mouse.move(x, y); await page.mouse.down()
    for k in range(1, 41): await page.mouse.move(x + k * 6, y + (5 if k % 2 else -5))
    await page.mouse.up()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await (await b.new_context(viewport={'width': 1100, 'height': 860}, locale='is-IS')).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_selector('.rows .row')
        # gig date label
        await page.click('#tab-setlists'); await page.click('.listcard')
        print('date label:', await page.inner_text('.datebox span'))
        await page.click('#tab-songs')
        await page.locator('.rows .row .open', has_text='Amazing Grace').click(); await page.wait_for_selector('#stage .sheet-body')
        # icons apart: edit sits next to close, notes keeps its label
        boxes = await page.evaluate("""[...document.querySelectorAll('#stage .sttop button')].map(b => [b.getAttribute('aria-label'), Math.round(b.getBoundingClientRect().left)])""")
        print('top bar order:', [b[0] for b in boxes][:4], '...')
        ed = [b for b in boxes if b[0] == 'Breyta lagi'][0][1]; nb = [b for b in boxes if b[0] == 'Glósur'][0][1]
        print('distance edit to notes (px):', abs(nb - ed), '| notes label shown:', await page.inner_text('.notesbtn'))
        await page.get_by_role('button', name='Glósur', exact=True).click()
        print('size buttons for pen:', await page.locator('.notesbar .nsize').count())
        # thin, then thick uniform line with the mouse
        await page.get_by_label('Fín lína').click(); await zigzag(page, 60, 200)
        await page.get_by_label('Þykk lína').click()
        await page.mouse.move(60, 330); await page.mouse.down(); await page.mouse.move(300, 330, steps=10); await page.mouse.up()
        # pressure pen: light to firm
        await page.evaluate(PEN, [60, 460, 360, 0.1, 1.0])
        await page.get_by_role('button', name='Lokið').click(); await page.wait_for_timeout(400)
        n = await page.evaluate(NOTES)
        print('widths saved:', [x['w'] for x in n], '| pressure flags:', [x.get('pr', False) for x in n])
        pr = n[2]['pts']; print('pressure along pen line:', pr[0][2], '->', pr[-1][2])
        widths = await page.evaluate("""(() => { const ps = [...document.querySelectorAll('#stage .notes-svg g path.ink')]; return ps.map(p => [p.getAttribute('fill'), Math.round(p.getBBox().height)]); })()""")
        print('rendered (fill, height):', widths)
        # smoothing: the same wobbly line with smoothing off and high
        def wobble(pts): ys = [q[1] for q in pts]; return round(statistics.pstdev(ys), 3)
        res = {}
        for lvl, name in [(0, 'Engin'), (3, 'Mikil')]:
            await page.keyboard.press('Escape'); await page.click('#btn-settings')
            await page.locator('dialog .seg button', has_text=name).click(); await page.get_by_role('button', name='Lokið').click()
            await page.locator('.rows .row .open', has_text='Amazing Grace').click(); await page.wait_for_selector('#stage .sheet-body')
            await page.get_by_role('button', name='Glósur', exact=True).click(); await page.get_by_label('Fín lína').click()
            await zigzag(page, 60, 600)
            await page.get_by_role('button', name='Lokið').click(); await page.wait_for_timeout(400)
            res[name] = wobble((await page.evaluate(NOTES))[-1]['pts'])
        print('wobble (std dev of y, em): off', res['Engin'], '| high', res['Mikil'])
        await page.screenshot(path='/home/claude/shots/v32-stage.png')
        await page.get_by_role('button', name='Glósur', exact=True).click()
        await page.screenshot(path='/home/claude/shots/v32-bar.png', clip={'x': 0, 'y': 0, 'width': 1100, 'height': 140})
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
