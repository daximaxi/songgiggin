"""v3.3: capo, lyrics only, chord diagrams, chord tap, print and PDF. Runs against dist-pwa/ over http
so the PDF library loads from the app's own files, as on GitHub Pages."""
import asyncio, subprocess, time
from playwright.async_api import async_playwright
PORT = 8765
URL = f'http://127.0.0.1:{PORT}/index.html'

async def main():
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-d', '/home/claude/songgiggin/dist-pwa'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
            ctx = await b.new_context(viewport={'width': 1100, 'height': 860}, locale='is-IS', accept_downloads=True)
            page = await ctx.new_page()
            errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
            await page.goto(URL); await page.wait_for_selector('.rows .row')
            await page.locator('.rows .row .open', has_text='Amazing Grace').click(); await page.wait_for_selector('#stage .sheet-body')
            before = await page.locator('#stage .ch[data-c]').count()
            print('chords on sheet:', before)
            # tap a chord: its diagram pops up
            await page.locator('#stage .ch[data-c]').first.click()
            print('chord pop shown:', await page.locator('#stage .cd-pop').count() == 1)
            await page.locator('#stage .sheet-body').click(position={'x': 5, 'y': 5})
            # diagrams strip
            await page.get_by_label('Sýna hljómamyndir').click()
            print('diagram strip cards:', await page.locator('#stage .cd-strip .cd').count())
            # capo 2: chords move down two semitones
            first = await page.locator('#stage .ch[data-c]').first.inner_text()
            await page.locator('#stage .capobtn').click()
            await page.locator('dialog .capoopt', has_text='2').first.click()
            after = await page.locator('#stage .ch[data-c]').first.inner_text()
            print('capo 2:', first, '->', after, '| button:', await page.locator('#stage .capobtn').inner_text())
            # lyrics only
            await page.locator('#stage .chordsbtn').click()
            print('lyrics only, chords left:', await page.locator('#stage .ch[data-c]').count())
            await page.locator('#stage .chordsbtn').click()
            # PDF from a setlist
            await page.keyboard.press('Escape')
            await page.click('#tab-setlists'); await page.click('.listcard')
            await page.get_by_role('button', name='Prenta / PDF').click()
            async with page.expect_download(timeout=20000) as dl:
                await page.get_by_role('button', name='Sækja PDF').click()
            d = await dl.value
            path = '/tmp/sg-test.pdf'; await d.save_as(path)
            head = open(path, 'rb').read(5)
            print('pdf:', d.suggested_filename, '| starts with %PDF:', head == b'%PDF-')
            print('ERRORS:', errs)
            await b.close()
    finally:
        srv.terminate()

asyncio.run(main())
