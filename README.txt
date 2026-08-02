Arbeitszeit PWA – Version 5.27

Vollständig offlinefähige Arbeitszeiterfassung für iPhone 16.
Start: index.html öffnen oder als PWA zum Home-Bildschirm hinzufügen.

Datenhaltung und Kompatibilität:
- lokaler Speicherschlüssel arbeitszeit-pwa-v1 unverändert
- Datenschema 11 mit automatischer, verlustfreier Migration aus V5.26 und älteren Sicherungen
- Berechnungsbeginn 01.11.2022, Startwert Zeitkonto 00:00
- Ausgangsdaten aus Arbeitszeit_Backup_2026-08-02.json übernommen
- technische Leerdatensätze vor dem 01.11.2022 werden nicht mehr geführt
- historische Importwerte bleiben als Vergleichsdaten erhalten

Neu in V5.27:
- einheitlicher kalenderbasierter Rechenkern für Tag, Woche, Monat, Jahr, Zeitkonto, Diagramme, PDF und Excel
- keine Stichtags- oder datumsspezifische Sonderrechnung im laufenden Rechenkern
- Montag bis Freitag grundsätzlich 08:00 Sollzeit
- gesetzliche und betriebliche Feiertage mit 00:00 Sollzeit
- Urlaub und Krankheit ganzer Tag mit 00:00 Sollzeit, halber Urlaub mit 04:00 Sollzeit
- Gleittag/Zeitausgleich mit 08:00 Sollzeit und damit -08:00 Tagessaldo
- Wochenend- und Feiertagsarbeit vollständig als Pluszeit
- Übernachtarbeit wird vollständig dem begonnenen Tag zugerechnet
- vergangene Arbeitstage ohne Buchung werden mit -08:00 bewertet und als offen angezeigt
- unvollständige Tage werden mit 00:00 Ist gegen die Sollzeit bewertet und als unvollständig angezeigt
- Rundung und tatsächlich eingetragene Pausen bleiben maßgeblich
- Historienvergleich als zusätzliches Tabellenblatt im Excel-Export

Umgesetzte Datenkorrekturen:
- 02.06.2026: Brutto 12:00, Pause 01:15, Netto 10:45, Saldo +02:45
- 15.12.2025: fehlerhafte Einzelbuchung 00:00 entfernt, Urlaub beibehalten
- 18.09.2023, 25.01.2024, 26.01.2024 und 30.09.2024 als Gleittage mit jeweils -08:00
- acht fälschlich als Urlaub markierte Arbeitstage im März/April 2025 bereinigt
- 01.09.2025 wieder vollständig in Monat, Jahr und Zeitkonto einbezogen
- verwaiste Pause am 27.07.2026 entfernt; der Tag bleibt ohne Buchung offen

Aktueller bereinigter Stand am 02.08.2026 vor manueller Rekonstruktion offener Julitage:
- Zeitkonto +136:42
- offene Tage: 24.07. sowie 27.07. bis 31.07.2026

Weiterhin enthalten:
- Schnellwege über den Plus-Button
- vollständiger Tageseditor und Einzelbuchungseditor
- Auswertungen, Diagramme, PDF, Excel, Sicherungs-ZIP und JSON-Wiederherstellung
- vollständige Offlinefähigkeit
