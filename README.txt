Arbeitszeit-PWA Offline V5.1

Installation / Aktualisierung auf dem iPhone:
1. Den vollständigen Inhalt dieses Ordners über eine HTTPS-Adresse bereitstellen.
2. Die Adresse in Safari öffnen.
3. Teilen > Zum Home-Bildschirm > Hinzufügen.
4. Bei einer Aktualisierung die PWA einmal vollständig schließen und erneut öffnen. Falls weiterhin die alte Oberfläche erscheint, die Home-Bildschirm-App entfernen und erneut hinzufügen. Die lokalen Arbeitszeitdaten im Browserprofil bleiben normalerweise erhalten; vorher wird dennoch ein JSON-Backup empfohlen.

Datenmigration:
- Der bisherige lokale Speicherschlüssel „arbeitszeit-pwa-v1“ bleibt unverändert.
- Vorhandene V4-Daten und kompatible JSON-Backups werden automatisch auf Schema 5 ergänzt.
- Bestehende Tage werden nicht überschrieben. Fehlende importierte Grunddaten 2022 bis 2026 werden ergänzt.
- Der verbindliche Zeitkontostand +194:46 zum 21.07.2026 bleibt erhalten.

Einzeldatei:
- index.html enthält die komplette Anwendung und funktioniert auch als einzelne lokale Offline-HTML-Datei.
- Für die installierbare PWA werden zusätzlich Manifest, Service Worker und Icons benötigt.
