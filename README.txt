Arbeitszeit-PWA Offline V5.2 High-End

Installation / Aktualisierung auf dem iPhone:
1. Den vollständigen Inhalt dieses Ordners über eine HTTPS-Adresse bereitstellen.
2. Die Adresse in Safari öffnen.
3. Teilen > Zum Home-Bildschirm > Hinzufügen.
4. Bei einer Aktualisierung die PWA vollständig schließen und erneut öffnen.
5. Erscheint noch die alte Oberfläche, die Home-Bildschirm-App entfernen und erneut hinzufügen. Vorher vorsorglich unter Auswertung ein JSON-Backup erstellen.

Datenmigration:
- Der lokale Speicherschlüssel „arbeitszeit-pwa-v1“ bleibt unverändert.
- Bestehende Daten, importierte Jahre 2022 bis 2026 und kompatible Backups bleiben erhalten.
- Der verbindliche Zeitkontostand +194:46 zum 21.07.2026 wird nicht neu berechnet oder doppelt addiert.
- Die Design- und Plausibilitätsänderungen benötigen keine Datenmigration.

Neue Buchungssperre:
- Neue dokumentierte Buchungen müssen mindestens fünf Minuten auseinanderliegen.
- Der nächste Button zeigt automatisch, ab wann er freigegeben wird.
- Tatsächliche Uhrzeiten werden weiterhin gespeichert und unter Zeiten angezeigt.

Einzeldatei:
- Die zusätzlich bereitgestellte HTML-Datei enthält die vollständige Anwendung und kann lokal geöffnet werden.
- Für eine installierbare PWA werden Manifest, Service Worker und Icons aus der ZIP benötigt.
