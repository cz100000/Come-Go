Arbeitszeit PWA – Version 5.41
Stand: 04.08.2026

Zweck
Vollständig offlinefähige Arbeitszeiterfassung für das iPhone 16 im Hochformat. Die Anwendung speichert ausschließlich lokal im Browser und benötigt nach der Erstinstallation keine Internetverbindung.

Installation über GitHub Pages
1. Sämtliche Dateien dieses Ordners unverändert in dasselbe GitHub-Pages-Verzeichnis hochladen.
2. Die veröffentlichte HTTPS-Adresse in Safari öffnen.
3. In Safari „Teilen“ und anschließend „Zum Home-Bildschirm“ wählen.
4. Nach einem Versionswechsel die PWA vollständig schließen und erneut öffnen.

Daten und Kompatibilität
- Lokaler Speicherschlüssel unverändert: arbeitszeit-pwa-v1
- Datenschema: 14
- Datenbeginn: 01.11.2022
- Eingebetteter Ausgangsdatenstand: JSON-Sicherung vom 03.08.2026
- 1.128 Kalendertage und 1.792 Buchungen im eingebetteten Referenzbestand; einschließlich ergänzter Feiertagstage werden beim geprüften Start 1.148 Tage geführt
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
Die Einstellungsseite ist in kompakte Themenkarten gegliedert:
- Persönliche Angaben
- Arbeitszeit
- Urlaub und Feiertage
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
Ein physischer Installationstest auf einem iPhone mit Mobile Safari war in der Entwicklungsumgebung nicht möglich. Für V5.40 wurden die relevanten Karten automatisiert bei 320, 350, 375, 393 und 430 px Breite geprüft; die Haupt-Sichtprüfung erfolgte bei 393 × 852 px.


Wichtige Änderungen in V5.32
- Grafische Korrektur der Karte „Eintrag für heute“.
- Vollständige Migration dieser Karte auf die einheitliche Kartenstruktur.
- Sichere Innenabstände sowie begrenzte Titel-, Text- und Aktionsbereiche.
- Zusätzliche Schutzregeln gegen Inhaltsüberlauf in Bestandsdialogen.
- Keine fachlichen oder datenbezogenen Änderungen.


Wichtige Änderungen in V5.40
- Plus-Menü auf „Vollständigen Tag bearbeiten“ und „Abwesenheit eintragen oder bearbeiten“ reduziert.
- Neue kompakte Zeile „Schnelleinträge“ auf der Heute-Seite und eine gemeinsame Bearbeitungskarte für Pause und Kommentar ohne Datumswahl.
- Einheitlicher Abwesenheitseditor mit Von-/Bis-Datum nebeneinander ab 370 px, einspaltigem Fallback darunter, kompakter Arbeitstagsvorschau, Konfliktbehandlung sowie Bearbeiten und Löschen zusammengehöriger Zeiträume.
- Zukünftige Abwesenheiten bleiben zulässig; zukünftige Arbeitszeitbuchungen bleiben gesperrt.
- Urlaubsanspruch und Resturlaubsübertrag werden jahresbezogen ausschließlich in den Einstellungen geführt.
- Grüne Urlaubsgrafik ohne zusätzliche Kennzahlenkarte oberhalb der Grafik, mit dynamischem Jahres-/Monatsdetailbereich und separater vollständiger Urlaubsverwaltung.
- Zusammengehörige neue Urlaubszeiträume erhalten eine Gruppen-ID; ältere Einzelbestände werden für die Anzeige fachlich zusammengefasst, ohne die Quelldaten umzuschreiben.
- JSON- und Excel-Dateien eines Sicherungsvorgangs erhalten denselben Zeitstempel im Namen und in den Dateimetadaten.
- Schema 14 ergänzt migrationssicher den Ausgangsanspruch 2026 mit 139 Tagen, ohne vorhandene Nutzerwerte oder Überträge zu überschreiben.
- Mobile Überlaufprüfung automatisiert bei 320, 350, 375, 393 und 430 px Breite; 14 Sichtprüfungen wurden bei 393 px beziehungsweise für den Fallback bei 350 px dokumentiert. Ein physischer iPhone-/Safari-Test bleibt erforderlich.


Wichtige Änderungen in V5.40
- Die alte Zwischenansicht „Zeit ergänzen oder korrigieren“ wird nicht mehr aufgerufen; alle entsprechenden Wege öffnen direkt „Vollständigen Tag bearbeiten“.
- Die nächste Buchungsaktion wird eindeutig als „Kommen hinzufügen“, „Gehen ergänzen“ oder „Weiteren Arbeitsblock hinzufügen“ bezeichnet.
- Dokumentierte Uhrzeiten sind nicht mehr frei editierbar und werden beim Speichern verbindlich aus der tatsächlichen Uhrzeit berechnet: Kommen aufwärts, Gehen abwärts auf 5 Minuten.


Wichtige Änderungen in V5.41
- Die Schnelleintragskarte steht fest unmittelbar links neben dem Plus-Button und beginnt nicht oberhalb dessen Oberkante.
- Der bestätigte 24.03.2026 ist mit Kommen 09:40, Gehen 21:00 und 45 Minuten Pause in der Importbasis hinterlegt; eine gezielte Migration behebt leere Altstände, ohne neuere manuelle Änderungen zu überschreiben.
- Die Urlaubsgrafik verwendet standardmäßig eine Y-Achse bis 15 Tage. Erst bei einem tatsächlichen Monatswert über 15 Tagen wird die Achse in 5-Tage-Schritten erweitert.
