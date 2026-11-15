"""Older UI tests were written against the three example songs a new device used to get
(Oh! Susanna, House of the Rising Sun, Amazing Grace). Since 4.1.1 a new device gets only
House of the Rising Sun. Importing this module gives every browser context those three
songs as they were (marked as examples), unless the page already has data.
Set fixture.ENABLED = False before creating a context to see a truly new device."""
import json, os
from playwright.async_api import Browser

ENABLED = True
_DATA = open(os.path.join(os.path.dirname(__file__), 'fixtures', 'examples-v1.json'), encoding='utf-8').read()
_SCRIPT = "try { if (!localStorage.getItem('songgiggin.data.v1')) localStorage.setItem('songgiggin.data.v1', %s); } catch (e) {}" % json.dumps(_DATA)

_orig_ctx = Browser.new_context
_orig_page = Browser.new_page

async def _new_context(self, *a, **k):
    ctx = await _orig_ctx(self, *a, **k)
    if ENABLED: await ctx.add_init_script(_SCRIPT)
    return ctx

async def _new_page(self, *a, **k):
    ctx = await _new_context(self, *a, **k)
    return await ctx.new_page()

Browser.new_context = _new_context
Browser.new_page = _new_page
