Arbeitszeit-PWA Offline V5.4 High-End – iPhone 16
Stand: 23.07.2026

INHALT
- index.html: vollständige Offline-Anwendung
- manifest.webmanifest, sw.js, icon-192.png, icon-512.png: installierbare Offline-PWA
- README.txt, AENDERUNGEN.txt, TESTUEBERSICHT.txt, MIGRATION_V5_4.txt und ABSCHLUSSBERICHT_V5_4.txt
- Prüfdokumente, Abschlussbericht und Referenzbilder der geprüften Datenbasis

START
1. index.html kann direkt lokal im Browser geöffnet werden.
2. Für die Installation als PWA den vollständigen Ordner über HTTPS bereitstellen.
3. In Safari: Teilen > Zum Home-Bildschirm.

DATEN UND MIGRATION
- Der LocalStorage-Schlüssel „arbeitszeit-pwa-v1“ bleibt unverändert.
- Das Datenschema wird automatisch von 6 auf 7 erweitert.
- Bestehende Buchungen, Einstellungen, Importdaten und Zeitkontostände bleiben erhalten.
- Neue Abwesenheiten werden als eigene Tagesdaten mit Art, Umfang, angerechneter Zeit und gemeinsamer Vorgangskennung gespeichert.
- Gelöschte Importbuchungen bleiben durch einen lokalen Leerstand dauerhaft gelöscht, bis „Importdaten wiederherstellen“ ausdrücklich gewählt wird.
- JSON-Export und -Import enthalten die neuen Abwesenheitsfelder vollständig.

OFFLINE
- Keine externen Bibliotheken, CDNs, Webfonts, Server- oder Cloudverbindungen.
- Service-Worker-Cache: arbeitszeit-v5-4-high-end-2026-07-23.
- Keine Notifications, Push-Mitteilungen, App-Badges oder native iOS-Hülle.
