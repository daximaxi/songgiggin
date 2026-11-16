"""v4.2.1: compact stage on phones (tools sheet, speed button, bars hide while scrolling) and break names in the app language."""
import asyncio, sys
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fixture  # the three example songs the tests were written against
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        errs = []
        ctx = await b.new_context(viewport={'width': 412, 'height': 860}, locale='en-GB', color_scheme='dark', has_touch=True, is_mobile=True, device_scale_factor=2)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file:///home/claude/songgiggin/dist/index.html'); await pg.wait_for_selector('.rows .row')
        # single song from the pool
        await pg.locator('.rows .row .open').first.click(); await pg.wait_for_selector('#stage')
        await pg.screenshot(path='/home/claude/shots/c1-song.png')
        sheet = await pg.locator('#stage-sheet').bounding_box(); print('sheet height (single song):', round(sheet['height']), 'of 860')
        await pg.click('#stage-tools-btn'); await pg.wait_for_timeout(200)
        await pg.screenshot(path='/home/claude/shots/c2-tools.png')
        await pg.click('.stscrim', position={'x': 200, 'y': 60}); await pg.wait_for_timeout(200)
        print('tools closed:', not await pg.locator('#stage-tools').is_visible())
        await pg.click('#stage-speed'); await pg.wait_for_timeout(200)
        await pg.screenshot(path='/home/claude/shots/c3-speed.png', clip={'x': 0, 'y': 760, 'width': 412, 'height': 100})
        await pg.locator('.transport .step').last.click(); print('speed now:', await pg.inner_text('#stage-speed'))
        await pg.wait_for_timeout(3800); print('speed bar closed:', not await pg.locator('.transport .step').last.is_visible())
        # play: bars hide
        await pg.locator('.transport .play').click(); await pg.wait_for_timeout(600)
        print('immersive:', await pg.evaluate("document.getElementById('stage').classList.contains('immersive')"), '| top visible:', await pg.locator('.sttop').is_visible())
        await pg.screenshot(path='/home/claude/shots/c4-playing.png')
        await pg.locator('#stage-mini .iconbtn').nth(2).click(); print('mini +:', await pg.inner_text('#stage-mini b'))
        await pg.locator('#stage-sheet').click(position={'x': 200, 'y': 400}); await pg.wait_for_timeout(300)
        print('tap shows bars:', await pg.locator('.sttop').is_visible())
        await pg.wait_for_timeout(4500); print('hidden again:', not await pg.locator('.sttop').is_visible())
        await pg.locator('#stage-mini .iconbtn').first.click(); await pg.wait_for_timeout(200)
        print('paused, bars back:', await pg.locator('.sttop').is_visible())
        await pg.keyboard.press('Escape')
        # setlist in English: the break name follows the language
        await pg.click('#tab-setlists'); await pg.click('.listcard'); await pg.click('#add-break'); await pg.wait_for_timeout(200)
        print('break placeholder:', await pg.locator('.brkrow .brkname input').get_attribute('placeholder'), '| value:', repr(await pg.locator('.brkrow .brkname input').input_value()))
        await pg.click('text=Start'); await pg.wait_for_selector('#stage')
        for i in range(3): await pg.locator('.transport .nav.next').click()
        print('stage break title:', await pg.inner_text('#stage .sttitle b'))
        await pg.screenshot(path='/home/claude/shots/c5-break.png')
        # an older break saved as "Hlé" shows as "Break" in English
        await pg.keyboard.press('Escape')
        await pg.evaluate("""() => { const d = JSON.parse(localStorage.getItem('songgiggin.data.v1')); const sl = d.setlists['ex-gig']; sl.items.forEach(i => { if (i.type === 'break') i.name = 'Hlé'; }); sl.updatedAt = Date.now(); localStorage.setItem('songgiggin.data.v1', JSON.stringify(d)); }""")
        await pg.reload(); await pg.wait_for_timeout(1000); await pg.click('#tab-setlists'); await pg.click('.listcard')
        print('old "Hlé" in English:', repr(await pg.locator('.brkrow .brkname input').input_value()), await pg.locator('.brkrow .brkname input').get_attribute('placeholder'))
        # wide screen unchanged
        await pg.set_viewport_size({'width': 1100, 'height': 860}); await pg.locator('.setsongs li .open').first.click(); await pg.wait_for_selector('#stage')
        print('wide: tools button hidden:', not await pg.locator('#stage-tools-btn').is_visible(), '| key − visible:', await pg.locator('.sttop .stctl').first.is_visible(), '| steps visible:', await pg.locator('.transport .step').first.is_visible())
        await pg.screenshot(path='/home/claude/shots/c6-wide.png', clip={'x': 0, 'y': 0, 'width': 1100, 'height': 200})
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
