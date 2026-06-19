<!-- Sayfa 1 -->

## AnyTone D878UVII Firmware Changelog

This document provides Change Log Release notes for the AnyTone D878UVII firmware
updates. It includes important instructions, feature highlights, and resolved issues for
each version.

## General Update Instructions

-  Always save your codeplug to your PC before updating.
-  In the current CPS on your computer, read your radio, then go to Optional Settings,
in the left column, and in the pop-up box, click the Power On tab.
-  Make sure Startup Reset is ON and the GPS test is OFF. If Startup Reset is OFF,
turn it ON, and make sure GPS Test is OFF. Then write it back to the radio. Then
save the codeplug to your computer with the current DATE as the file name.
-  Then install the new firmware:
Power off the radio.
1. Power off the radio.
2. Hold PTT and PF3 while powering back on. PF3 is the Green button next to
the antenna on top of the radio.
3. The screen should stay off, and you will see a RED blinking light next to the
volume knob. This is firmware update mode.
4. Then on the computer, uninstall the current CPS, and install the NEW CPS.
5. Once installed, click SET, then Set COM. In the popup window, select the
Com Port of your radio. Click Ok
6. Then click on TOOL in the MENU bar at the top, and then Firmware and Icon
update. This will open the Firmware Update tool.
7. Make sure the Com Port listed is the same one your radio is on, then click
OPEN UPDATE FILE. Locate the folder where you extracted the CPS and
Firmware file to. Go into the folder that has the name of the Current
Firmware and ends with the letters FW. (example D878UVii_V4.00FW)
8. Then click the file in there, and click OPEN
9. Then click WRITE. Once complete the radio will reboot.

-  After installing new firmware, a radio reset is required (also known as a MCU
Reset):
10. Power off the radio.
11. Hold PTT and PF1 while powering back on.

-  The radio will say “Booting… Please Wait…”, Then it will say “Are you sure you
want to Initialize Radio?” Press confirm and then wait for the radio to reboot.

(New Change Log format provided by Jeremiah Mulford – W9JAM) 1

---

<!-- Sayfa 2 -->

-  When it reboots it will ask you to set the date and time again. You can do that now
or skip it and do it later. Press Confirm to finish the MCU Reset. Now in the new
CPS, open the codeplug file you saved earlier, and write it to the Radio.

Do not power off the radio until the reset completes.

(New Change Log format provided by Jeremiah Mulford – W9JAM) 2

---

<!-- Sayfa 3 -->

USB Driver Note

-  On Windows 10 and 11 PC’s, Windows will auto-detect the USB Serial Device
Driver.
-  DO NOT install the GD32 Virtual Driver on these systems. That driver is ONLY
for Windows 7 and Windows 8 systems.
-  If you plug in the cable by itself, without the radio connected, and a Com Port
appears in Device Manager, you have the WRONG programming cable. Locate
the correct programming cable, or your dealer for a replacement.

## Version 4.00 (August 15, 2025)

Highlights: - Satellite Feature Removed – Satellite mode caused instability due to CPU
space limitations. This update restores stability by removing it. If you need satellites, stay
on V3.08N. - APRS Download Fix – Corrected an issue that prevented APRS from
downloading into CPS.

Versions: - Firmware: V4.00 - CPS: V4.00 - Icon Pack: V1.23 (no update needed) - SCT
3258: V2.01.07 BA (no update needed) - Bluetooth: V10046 - APRS: V1.06 or 2.00 (no
update needed)

## Version 3.08N (June 14, 2025)

Fixes: - Monitor function now opens speaker to white noise. - Resolved freezing issues
when using background images. - Fixed reception problems with A+D or D+A settings. -
Corrected “Repeater Out of Range” voice notification. - Fixed satellite TX frequency and
pass accuracy. - Improved Bluetooth reconnection for BT PTT buttons. - Radio now
remembers BT PTT button pairing after reboot.

Versions: - Firmware: V3.08N - CPS: V3.08 - Icon Pack: V1.23 (no update needed) - SCT
3258: V2.01.07 BA (no update needed) - Bluetooth: V10046 - APRS: V1.06 or 2.00 (no
update needed)

## Version 3.07 (April 29, 2025)

Fixes: - APRS reliability improvements. - Restored GPS info menu “Edit” button. -
Corrected satellite AOS limit issue. - Fixed missing audio when listening to satellites with
SQ=0. - Satellite name now displays correctly after loading data.

(New Change Log format provided by Jeremiah Mulford – W9JAM) 3

---

<!-- Sayfa 4 -->

Versions: - Firmware: V3.07 - CPS: V3.07 - Icon Pack: V1.23 (no update needed) - SCT
3258: V2.01.07 BA (no update needed) - Bluetooth: V10033–10043 (no update needed) -
APRS: V1.06 or 2.00 (no update needed)

## Version 3.06 (January 23, 2025)

New Features & Fixes: - Added Maidenhead locator display in GPS data. - APRS transmit
enabled under Satellite menu (PTT+PF2). - CTCSS/DCS transmit enabled under Satellite
menu (PTT+PF1). - Separate color codes for TX and RX in channel settings. - Fixed APRS TX
bug from V3.05. - Eliminated 250ms silent transmission when STE=OFF. - CPS now
supports satellite data import/export in CSV format.

Versions: - Firmware: V3.06 - CPS: V3.06 - Icon Pack: V1.22 (no update needed) - SCT
3258: V2.01.07 BA (no update needed) - Bluetooth: V10033–10043 (no update needed) -
APRS: V1.06 or 2.00 (no update needed)

## Version 3.05 (December 12, 2024)

Improvements: - Satellite power can be set independently from channel power. - Fixed
freezing during satellite prediction. - Satellite menu no longer auto-exits. - CPS satellite
update tool supports custom download links. - Master ID option added for all-channel use.
- GPS info menu can now save fixed beacons. - Added analog squelch level adjustment to
side keys.

Versions: - Firmware: V3.05 - CPS: V3.05 - Icon Pack: V1.22 - SCT 3258: V2.01.07 BA (no
update needed) - Bluetooth: V10033–10043 (no update needed) - APRS: V1.06 or 2.00 (no
update needed)

## Version 3.04 (September 15, 2024)

New Features: - Introduced Satellite Mode with prediction list, frequencies, and pass
details. - New green GPS icon design (by IK8JHL). - CPS now supports ARC4 and AES256
key import/export.

Versions: - Firmware: V3.04 - CPS: V3.04 - Icon Pack: V1.22 - SCT 3258: V2.01.07 BA (no
update needed) - Bluetooth: V10033–10043 (no update needed) - APRS: V1.06 or 2.00 (no
update needed)

(New Change Log format provided by Jeremiah Mulford – W9JAM) 4

---

<!-- Sayfa 5 -->

## Version 3.03 (December 18, 2023)

Improvements: - Faster scan speed (ignores short bursts). - SMS modified for
BrandMeister text capture. - CPS restrictions on AES/ARC4 encryption readout. - New “Dim
Shut” key function to disable backlight/LED. - AES encryption now uses variable vector (IV)
for security.

Versions: - Firmware: V3.03 - CPS: V3.03 - SCT 3258: V2.01.07 BA (no update needed) -
Bluetooth: V10033–10043 (no update needed) - APRS: V1.06 or 2.00 (no update needed)

## Version 3.02 (April 21, 2023)

New Features: - Added ARC4 encryption (Motorola-compatible). - Option to adjust voice
header repetitions for improved sync. - Adjustable TX preamble for data transfer. -
Improved SMS compatibility. - Call Alert now ETSI-compliant.

Versions: - Firmware: V3.02 - CPS: V3.02 - SCT 3258: V2.01.07 BA (no update needed) -
Bluetooth: V10033–10043 (no update needed)

## Version 3.01 (November 4, 2022)

Fixes: - Analog 5-Tone ID decode/encode standards aligned. - AES256 keys can only be
written, not read, for security.

Versions: - Firmware: V3.01 - CPS: V3.01 - SCT 3258: V2.01.07 BA (no update needed) -
Bluetooth: V10033–10036 (no update needed) - APRS: V1.04

## Version 3.00 (October 14, 2022)

New Features: - Added “None” option for RX Group List. - Talk Group alerts can now be set
individually. - New global digital channel idle-state beep settings.

Versions: - Firmware: V3.00 - CPS: V3.00 - SCT 3258: V2.01.07 BA (no update needed) -
Bluetooth: V10033 (no update needed) - APRS: V1.04

## Version 2.05 (April 11, 2022)

Fixes & Improvements: - Sub band defaults to OFF during GPS roaming. - New APRS
“Pass All” option (display packets with errors if enabled). - Improved analog APRS receive
performance. - Fixed CPS export compatibility with Contact Manager.

(New Change Log format provided by Jeremiah Mulford – W9JAM) 5

---

<!-- Sayfa 6 -->

Versions: - Firmware: V2.05 - CPS: V2.05 - SCT 3258: V2.01.07 BA (no update needed) -
Bluetooth: V10033 (no update needed) - APRS: V1.03

## Version 2.04 (December 10, 2021)

Fixes: - Repeater connectivity restored. - Talker Alias now saved properly in CSV export. -
New Talker Alias check/uncheck tool in CPS. - Fixed APRS frequency save issue. - Fixed
GPS roaming data save issue.

Versions: - Firmware: V2.04 - CPS: V2.04 - SCT 3258: V2.01.07 BA (no update needed) -
Bluetooth: V10033 (no update needed)

## Version 2.03 (November 30, 2021)

New Features: - Select TG and RX group list for new channels. - Improved Single
Frequency Repeater stability. - Added APRS SMS function (send/receive messages via
APRS). - Device info now shows APRS board version. - Added multiple analog APRS TX
frequencies. - New DCDM TS Split mode for repeater compatibility. - GPS Roaming
enhancements. - Zone Hide function for display simplification. - Drafts folder for unsent
SMS. - New GMT timezone support. - APRS error-code verification toggle.

Versions: - Firmware: V2.03 - CPS: V2.03 - SCT 3258: V2.01.07 BA (no update needed) -
Bluetooth: V10033 (no update needed)

## Version 2.02N (May 31, 2021)

Fixes: - FM radio toggle bug corrected. - APRS auto TX interval sync corrected.

Versions: - Firmware: V2.02N - CPS: V2.02N - SCT 3258: V2.01.07 BA (no update needed) -
Bluetooth: V10033 (no update needed)

## Version 2.02 (May 26, 2021)

New Features: - Date format selection on display. - Option to hide channel type, timeslot,
and color code. - Separate idle tones for digital/analog. - Auto scan startup option. -
Separate mic gain settings for analog and digital. - APRS TX bandwidth option
(wide/narrow). - Expanded 2-Tone/5-Tone/DTMF auto-reset times. - Added APRS
coarse/speed info. - Zone priority display now shows zone name.

Versions: - Firmware: V2.02 - CPS: V2.02 - SCT 3258: V2.01.07 BA - Bluetooth: V10033

(New Change Log format provided by Jeremiah Mulford – W9JAM) 6

---

<!-- Sayfa 7 -->

## Version 2.01b (April 10, 2021)

New Features: - Expanded digital contact list (up to 500,000). - Added Analog APRS
Receive function (AT-D878UVII Plus). - Logs include callsign, coordinates, direction,
distance, and digipeater paths. - CPS supports selective APRS receive filtering by
callsign/SSID.

Versions: - Firmware: V2.01b - CPS: V2.00 - SCT 3258: V2.01.07 BA - Bluetooth: V10033

## End of Changelog

(New Change Log format provided by Jeremiah Mulford – W9JAM) 7