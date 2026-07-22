Arbeitszeit-PWA Offline V5.3 High-End – iPhone 16
Stand: 22.07.2026

INHALT
- index.html: vollständige Anwendung
- manifest.webmanifest, sw.js, icon-192.png, icon-512.png: installierbare Offline-PWA
- README.txt, AENDERUNGEN.txt, TESTUEBERSICHT.txt
- DATENKORREKTUREN.txt
- MONATS_UND_JAHRESSTAENDE.txt
- Screenshots der geprüften Zielansichten

START ALS EIGENSTÄNDIGE HTML-DATEI
1. index.html lokal im Browser öffnen.
2. Die Anwendung funktioniert ohne Server und ohne Internet.
3. Lokale Daten werden im bestehenden Speicherschlüssel „arbeitszeit-pwa-v1“ gespeichert.

INSTALLATION ALS PWA AUF DEM IPHONE
1. Den vollständigen Ordnerinhalt über eine HTTPS-Adresse bereitstellen.
2. Die Adresse in Safari öffnen.
3. Teilen > Zum Home-Bildschirm > Hinzufügen.
4. Bei einer Aktualisierung die PWA vollständig schließen und erneut öffnen.
5. Vor größeren Aktualisierungen vorsorglich unter „Auswertung“ ein JSON-Backup erstellen.

DATEN UND MIGRATION
- Technische Basis ist V5.2; die Datenbasis wurde vollständig gegen die Excel-Dateien 2022 bis 2026 geprüft.
- Neuer verbindlicher Stichtag: 22.07.2026.
- Verbindlicher Zeitkontostand: +193:51 beziehungsweise 11.631 Minuten.
- Schema 6 und Importdatenversion 2 kennzeichnen die korrigierte Datenbasis.
- Der LocalStorage-Schlüssel „arbeitszeit-pwa-v1“ bleibt erhalten.
- Nachträglich bearbeitete/importergänzte Tage werden nicht ungeprüft überschrieben.
- Bestehende Buchungen nach dem 22.07.2026 bleiben erhalten.
- Unveränderte fehlerhafte Importwerte werden durch die geprüften Excel-Werte ersetzt.
- Der 22.07.2026 wird nicht doppelt auf das Zeitkonto angerechnet.

OFFLINE-FUNKTION
- Keine externen Bibliotheken, CDNs, Webfonts oder Internetzugriffe.
- Die Einzeldatei ist lokal nutzbar.
- Die PWA-Version speichert die erforderlichen Dateien im Service-Worker-Cache „arbeitszeit-v5-3-high-end-2026-07-22“.

BEDIENHINWEISE
- „Heute“ beginnt direkt mit Kommen und Gehen.
- Kommen rundet auf den nächsten Fünf-Minuten-Wert, Gehen auf den vorherigen.
- Zwischen zwei dokumentierten Buchungen liegen mindestens fünf Minuten.
- Mehrere Arbeitsblöcke und manuelle Pausen bleiben möglich.
- Berichte öffnen innerhalb der App. Der Druckdialog erscheint erst nach „Drucken / als PDF sichern“.
