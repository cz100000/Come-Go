Arbeitszeit PWA – Version 5.32
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
- 1.128 Kalendertage und 1.792 Buchungen im eingebetteten Referenzbestand
- Bestehende lokale Daten, JSON-Sicherungen und Datenmigrationen bleiben kompatibel.
- Sicherungen mit einem neueren als dem unterstützten Datenschema werden zum Schutz vor Datenverlust abgelehnt.

Ein-Karten-Bearbeitung
- Der Tageseditor verwendet einen zentralen Entwurfszustand.
- Buchungen, Pause, Abwesenheit, Kommentar und weitere Aktionen wechseln innerhalb derselben äußeren Karte.
- Unteransichten und Bestätigungen öffnen keine zweite sichtbare Karte.
- Erst „Tag speichern“ übernimmt alle vorgemerkten Tagesänderungen gemeinsam.
- Abbrechen oder Schließen verwirft den gesamten Entwurf erst nach einer Bestätigung innerhalb derselben Karte.
- Alle Dialogkarten verwenden 16 px Seitenabstand bei 393 px Viewportbreite, 12 px auf sehr schmalen Geräten und höchstens 480 px Kartenbreite auf größeren Geräten.

Einstellungen
Die Einstellungsseite ist in fünf kompakte Themenkarten gegliedert:
- Persönliche Angaben
- Arbeitszeit
- Feiertage
- Darstellung und Berichte
- App und Daten

Sollzeit und Bundesland werden auf der Hauptseite nur mit aktuellem Wert und Gültigkeitsdatum angezeigt. Die Bearbeitung erfolgt in einheitlichen Ein-Karten-Editoren mit Schutz vor unbeabsichtigten rückwirkenden Änderungen.

Verbindliche Sollzeit
- Seit 01.11.2022 gilt für jeden regulären Arbeitstag eine Grundsollzeit von 08:00 Stunden.
- Abweichende importierte Excel-Sollzeiten, insbesondere 07:48 Stunden, werden nicht als Berechnungsgrundlage verwendet.
- Abwesenheiten sowie gesetzliche und betriebliche Feiertage reduzieren die Sollzeit nach den bestehenden Regeln.
- Künftige Sollzeitänderungen werden mit einem Gültigkeitsdatum erfasst und verändern frühere Zeiträume nicht.

Feiertage
- Das Bundesland ist aus allen 16 deutschen Bundesländern auswählbar.
- Landesweit geltende gesetzliche Feiertage werden vollständig offline berechnet.
- Hessen ist für den bisherigen Zeitraum ab 01.11.2022 fest hinterlegt.
- Ein späterer Bundeslandwechsel wird mit Gültigkeitsdatum gespeichert.
- Heiligabend und Silvester bleiben als betriebliche freie Tage separat schaltbar.
- Kommunale oder nur in Teilgebieten geltende Sonderfeiertage werden nicht automatisch landesweit angesetzt.

Sicherung
„Sicherung und Excel teilen“ erzeugt genau zwei einzelne Dateien mit identischem Zeitstempel:
- Arbeitszeit_Backup_YYYY-MM-DD_HH-MM-SS.json
- Arbeitszeit_Auswertung_YYYY-MM-DD_HH-MM-SS.xlsx

Beide Dateien werden gemeinsam an das native Teilen-Menü übergeben. Unterstützt ein Gerät oder Ziel die gemeinsame Übergabe nicht, bietet die App beide Dateien einzeln zum Speichern an. Eine ZIP- oder Hinweise-TXT-Datei wird nicht erzeugt.

Wichtige Änderungen in V5.30
- einheitliche Ein-Karten-Navigation im vollständigen Tageseditor
- zentraler Tagesentwurf mit gemeinsamer Speicher- und Verwerfen-Logik
- interne Buchungs-, Pausen-, Abwesenheits-, Kommentar- und Aktionsansichten
- interne Bestätigungsansichten statt übereinanderliegender Karten
- kompakte, thematisch gegliederte Einstellungsseite
- separate Sollzeit- und Bundeslandeditoren mit Gültigkeitsdatum
- systemweit einheitliche Kartenbreite, Safe-Area-Abstände und Überlaufschutz
- feste Bedienbereiche und sichere Scrollflächen auch für bestehende direkte Einstiegskarten
- Wiederherstellungsbestätigung in einer einheitlichen Karte

Unverändert erhalten
- vollständiger Datenbestand und bestehendes Datenmodell
- Arbeitszeit-, Pausen-, Abwesenheits-, Kommentar- und Zeitkontologik
- halbtägige Abwesenheiten und Nachtschichten über Mitternacht
- interne Rückfallsicherungen und Schutz vor neueren unbekannten Datenschemata
- PDF-Berichte, JSON-Sicherung, Excel-Auswertung und Zwei-Dateien-Teilen
- Manifest, Service Worker und vollständiger Offline-Betrieb

Bekannter Datenhinweis
Der 24.03.2023 enthält einen halben Urlaubstag, aber keine Arbeitszeitbuchungen für die verbleibende Sollzeit. Dieser Tag wird weiterhin korrekt als offener Arbeitstag angezeigt und nicht automatisch verändert.

Technischer Hinweis
Ein physischer Installationstest auf einem iPhone mit Mobile Safari war in der Entwicklungsumgebung nicht möglich. Die Oberfläche wurde automatisiert bei 320 × 700, 350 × 750, 393 × 852, 430 × 900, 768 × 900 und 1024 × 900 Pixeln geprüft.


Wichtige Änderungen in V5.32
- Grafische Korrektur der Karte „Eintrag für heute“.
- Vollständige Migration dieser Karte auf die einheitliche Kartenstruktur.
- Sichere Innenabstände sowie begrenzte Titel-, Text- und Aktionsbereiche.
- Zusätzliche Schutzregeln gegen Inhaltsüberlauf in Bestandsdialogen.
- Keine fachlichen oder datenbezogenen Änderungen.
