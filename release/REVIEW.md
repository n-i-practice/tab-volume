# Chrome ウェブストア審査用入力案

## Single purpose

Adjust the playback volume of individual Chrome tabs and let users save and manually apply volume settings for specific sites or pages.

## Permission justifications

| Permission | Justification |
| --- | --- |
| `activeTab` | Access the current tab when the user opens the popup. Read its URL to show the saved volume rules that apply to that page. |
| `tabCapture` | Capture audio from the user-selected tab when they change its volume or mute it so the extension can play that audio at the selected level. |
| `offscreen` | Run Web Audio for the captured stream and continue playback after the popup is closed. |
| `storage` | Save user-created volume rules and display preferences in the browser profile. |

## Privacy practices

- **Remote code** — Select **No**. The scripts and translation files are bundled with the extension. The Ko-fi button opens a separate site when clicked.
- **Web history** — The extension reads the active tab's URL when invoked. When a user saves a rule, it stores the selected URL components in `chrome.storage.local`.
- **Website content** — The extension processes the active tab's audio in memory when the user adjusts its volume or mutes it. Audio and saved rules stay on the device.
- **Privacy policy URL** — Enter the public URL for the published [privacy policy](PRIVACY.md).

Use the data categories above when reviewing the dashboard's current wording. Chrome Web Store requires disclosure of data handled locally. [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) · [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq#3-does-an-extension-need-to-disclose-user-data-handling-if-the-data-is-only-processed-or-stored-locally-on-a-users-device)

## Test instructions

No login or test account is required.

1. Open the [W3C HTML5 Video Events and API demo](https://www.w3.org/2010/05/video/mediaevents.html). Select **Sintel teaser** and press **play()**. Keep the video player's own volume unchanged during the test.
2. Click the tab-volume toolbar icon. Set **Tab volume** to 50%. Click **Mute** and **Unmute**. The popup should still show 50% after unmuting.
3. Expand **Save volume setting**, select **Host**, and click **Save with this rule**. The popup lists the saved 50% rule.
4. Open the same demo in a new tab and start playback. Open tab-volume and click **Apply** beside the saved rule. Verify the tab volume changes from 100% to 50%.
5. Click **Reset to 100%**. The popup should show 100%, and the tab should return to normal Chrome playback.
6. In the popup, open the gear menu and select **Saved settings**. Use the trash icon to delete the test rule. Reopen the popup on the demo page and check that the rule is gone.
