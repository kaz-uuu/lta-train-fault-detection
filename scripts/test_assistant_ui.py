"""Browser regression checks against a running preview; all assistant replies mocked.

Run: python scripts/test_assistant_ui.py [http://127.0.0.1:8081]
Requires: pip install playwright; an installed Chrome browser.
"""
import json
import sys
from playwright.sync_api import sync_playwright, expect


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        held = []
        page.route("**/api/assistant/sessions", lambda route: route.fulfill(json={"id": "test-session"}))
        page.route("**/api/assistant/sessions/*/messages", lambda route: held.append(route))
        page.route("**/api/ps3/subsystems", lambda route: route.fulfill(json=[{
            "id": "shm", "name": "Structural health", "status": "ready",
            "latestRun": {"id": "internal-test-run", "status": "ready"},
        }]))
        page.route("**/api/ps3/runs/internal-test-run", lambda route: route.fulfill(json={
            "id": "internal-test-run", "results": [{"fileName": "test01.csv"}],
        }))
        page.goto(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8081")
        page.get_by_role("button", name="Ask Thomas").click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("heading", name="Thomas, maintenance assistant")).to_be_visible()
        expect(dialog.get_by_text("Hi, I'm Thomas!", exact=False)).to_be_visible()
        expect(dialog.get_by_role("combobox")).to_have_count(0)
        expect(dialog.get_by_text("GoA-R", exact=False)).to_have_count(0)
        expect(dialog.get_by_text("Include fictional", exact=False)).to_have_count(0)
        composer = dialog.get_by_label("Your question", exact=True)
        composer.fill("How do I upload data?")
        dialog.get_by_role("button", name="Send question").click()
        expect(composer).to_have_value("")
        expect(dialog.get_by_role("log").get_by_text("How do I upload data?", exact=True)).to_be_visible()
        expect(dialog.get_by_role("status")).to_be_visible()
        expect(dialog.get_by_role("button", name="Send question")).to_be_disabled()
        page.wait_for_timeout(100)
        assert len(held) == 1
        held.pop().fulfill(status=503, json={"detail": "Test provider unavailable"})
        expect(dialog.get_by_role("button", name="Retry")).to_be_visible()
        dialog.get_by_role("button", name="Investigate a result").click()
        picker = dialog.get_by_role("combobox")
        expect(picker).to_be_enabled()
        picker.focus(); page.keyboard.press("ArrowDown")
        expect(dialog.get_by_role("option", name="Structural health — test01.csv")).to_be_visible()
        page.keyboard.press("Enter")
        expect(picker).to_contain_text("test01.csv")
        expect(dialog.get_by_role("listbox")).to_have_count(0)
        picker.click(); page.keyboard.press("Escape")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("listbox")).to_have_count(0)
        picker.click(); dialog.get_by_role("heading", name="Thomas, maintenance assistant").click()
        expect(dialog.get_by_role("listbox")).to_have_count(0)
        assert "internal-test-run" not in dialog.inner_text()
        dialog.get_by_role("button", name="Retry").click()
        page.wait_for_timeout(100)
        assert len(held) == 1
        pending = held.pop()
        body = json.loads(pending.request.post_data)
        assert body["mode"] == "chat" and body["run_id"] is None, "Retry must retain original context"
        pending.fulfill(json={"text": "Choose a subsystem and upload its CSV.", "provider": "vertex", "trace": [], "recommendation": None})
        expect(dialog.get_by_text("Choose a subsystem and upload its CSV.", exact=True)).to_be_visible()
        expect(dialog.get_by_text("How do I upload data?", exact=True)).to_have_count(1)
        dialog.get_by_role("button", name="Ask a question").click()
        composer.fill("Line one"); composer.press("Shift+Enter"); composer.type("Line two")
        expect(composer).to_have_value("Line one\nLine two")
        composer.press("Enter")
        expect(composer).to_have_value("")
        page.wait_for_timeout(100)
        held.pop().fulfill(json={"text": "Second response", "provider": "vertex", "trace": [], "recommendation": None})
        expect(dialog.get_by_text("Second response", exact=True)).to_be_visible()
        assert not errors, errors
        browser.close()
        print("PASS: immediate send, retry/context, keyboard picker, chat visibility, plain labels, Enter/Shift+Enter; no browser errors")


if __name__ == "__main__":
    main()
