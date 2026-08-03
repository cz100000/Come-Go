Arbeitszeit PWA – Version 5.29
Stand: 03.08.2026

Zweck
Vollständig offlinefähige Arbeitszeiterfassung für das iPhone 16 im Hochformat. Die Anwendung speichert ausschließlich lokal im Browser und benötigt nach der Erstinstallation keine Internetverbindung.

Installation über GitHub Pages
1. Sämtliche Dateien dieses Ordners unverändert in dasselbe GitHub-Pages-Verzeichnis hochladen.
2. Die veröffentlichte HTTPS-Adresse in Safari öffnen.
3. In Safari „Teilen“ und anschließend „Zum Home-Bildschirm“ wählen.
4. Nach einem Versionswechsel die PWA vollständig schließen und erneut öffnen.

Daten und Kompatibilität
- Lokaler Speicherschlüssel unverändert: arbeitszeit-pwa-v1
- Datenschema: 12
- Datenbeginn: 01.11.2022
- Eingebetteter Ausgangsdatenstand: JSON-Sicherung vom 03.08.2026
- Bestehende lokale Daten, JSON-Sicherungen und Datenmigrationen bleiben kompatibel.
- Sicherungen mit einem neueren als dem unterstützten Datenschema werden zum Schutz vor Datenverlust abgelehnt.

Verbindliche Sollzeit
- Seit 01.11.2022 gilt für jeden regulären Arbeitstag eine Grundsollzeit von 08:00 Stunden.
- Abweichende importierte Excel-Sollzeiten, insbesondere 07:48 Stunden, werden nicht als Berechnungsgrundlage verwendet.
- Abwesenheiten sowie gesetzliche und betriebliche Feiertage reduzieren die Sollzeit nach den bestehenden Regeln.
- Künftige Sollzeitänderungen werden mit einem Gültigkeitsdatum erfasst und verändern frühere Zeiträume nicht.

Feiertage
- Das Bundesland ist in den Einstellungen auswählbar.
- Landesweit geltende gesetzliche Feiertage werden vollständig offline berechnet.
- Hessen ist für den bisherigen Zeitraum ab 01.11.2022 vorbelegt.
- Ein späterer Bundeslandwechsel wird mit Gültigkeitsdatum gespeichert.
- Heiligabend und Silvester bleiben als betriebliche freie Tage separat schaltbar.
- Kommunale oder nur in Teilgebieten geltende Sonderfeiertage können nicht allein aus dem Bundesland bestimmt werden und werden deshalb nicht automatisch landesweit angesetzt.

Sicherung
„Sicherung und Excel teilen“ erzeugt zwei einzelne Dateien mit identischem Zeitstempel:
- Arbeitszeit_Backup_YYYY-MM-DD_HH-MM-SS.json
- Arbeitszeit_Auswertung_YYYY-MM-DD_HH-MM-SS.xlsx

Beide Dateien werden gemeinsam an das native Teilen-Menü übergeben. Unterstützt ein Gerät oder Ziel die gemeinsame Übergabe nicht, bietet die App beide Dateien einzeln zum Speichern an. Eine ZIP- und eine Hinweise-TXT-Datei werden nicht mehr erzeugt.

Wichtige Änderungen in V5.29
- drei echte interne Rückfallsicherungen
- korrekte Prüfung halbtägiger Abwesenheiten
- einheitliche Unterstützung plausibler Buchungen über Mitternacht
- unverändertes Speichern verändert keine Importherkunft
- dynamische Jahreskennzeichnung
- direkte Auswahl „Zeitausgleich“
- verbesserte Dialog- und Fokusführung
- app-eigene Cache-Bereinigung ohne Löschen fremder Caches
- aktueller Datenbestand einschließlich der Buchungen bis 03.08.2026 eingebettet

Bekannter Datenhinweis
Der 24.03.2023 enthält einen halben Urlaubstag, aber keine Arbeitszeitbuchungen für die verbleibende Sollzeit. Dieser Tag wird nun korrekt als offener Arbeitstag angezeigt und nicht automatisch verändert.

Technischer Hinweis
Ein physischer Installationstest auf einem iPhone mit Mobile Safari war in der Entwicklungsumgebung nicht möglich. Die Darstellung wurde automatisiert mit 393 × 852 Pixeln sowie kleineren Kontrollgrößen geprüft.
