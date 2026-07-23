Arbeitszeit-PWA Offline V5.7 High-End – iPhone 16
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
- Das Datenschema wird automatisch auf Version 8 erweitert.
- Bestehende Buchungen, Einstellungen, Importdaten und Zeitkontostände bleiben erhalten.
- Neue Abwesenheiten werden als eigene Tagesdaten mit Art, Umfang, angerechneter Zeit und gemeinsamer Vorgangskennung gespeichert.
- Gelöschte Importbuchungen bleiben durch einen lokalen Leerstand dauerhaft gelöscht, bis „Importdaten wiederherstellen“ ausdrücklich gewählt wird.
- JSON-Export und -Import enthalten die neuen Abwesenheitsfelder vollständig.
- Die neue Einstellung „Countdown auf der Startseite“ wird automatisch ergänzt und ist standardmäßig aktiviert.
- Der einmalige Konfetti-Status wird lokal pro Kalendertag gespeichert.

OFFLINE
- Keine externen Bibliotheken, CDNs, Webfonts, Server- oder Cloudverbindungen.
- Service-Worker-Cache: arbeitszeit-v5-7-2026-07-23.
- Keine Notifications, Push-Mitteilungen, App-Badges oder native iOS-Hülle.


DRUCK / PDF
- Tagesbericht: A4 Hochformat.
- Monatsbericht: A4 Querformat, mehrseitig mit wiederholter Tabellenkopfzeile.
- Jahresbericht: A4 Querformat.
- Im Browser beim Drucken die vom Dokument vorgegebene Seitengröße verwenden; Skalierung 100 % beziehungsweise Standard.


COUNTDOWN UND TAGESZIEL
- Zeigt die verbleibende Arbeitszeit und die voraussichtliche Endzeit minutengenau.
- Manuell erfasste Pausen werden in Arbeitszeit und Mindestpause berücksichtigt.
- Standard-Mindestpause: 30 Minuten bei mehr als 6 bis 9 Stunden, 45 Minuten bei mehr als 9 Stunden.
- Bei ganztägiger Abwesenheit oder ausgeschaltetem Schalter wird die Karte vollständig ausgeblendet.
- Das Konfetti läuft einmal pro Tag etwa zwei Sekunden und nur bei aktivem Countdown sowie vollständig erreichtem Arbeits- und Pausenziel.
