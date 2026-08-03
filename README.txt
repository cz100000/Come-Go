Arbeitszeit PWA – Version 5.28

Vollständig offlinefähige Arbeitszeiterfassung für iPhone 16.
Start: index.html öffnen oder als PWA zum Home-Bildschirm hinzufügen.

Datenhaltung und Kompatibilität:
- lokaler Speicherschlüssel arbeitszeit-pwa-v1 unverändert
- Datenschema 11 unverändert; V5.27 und ältere kompatible Sicherungen werden weiterhin verlustfrei übernommen
- bestehendes Tagesfeld note bleibt die einzige Kommentarstruktur
- Kommentare bleiben in lokaler Speicherung, JSON-Sicherung, Wiederherstellung, Sicherungs-ZIP und Migration enthalten
- Berechnungsbeginn 01.11.2022 und sämtliche Rechenregeln aus V5.27 bleiben unverändert

Neu in V5.28:
- Kommentarzeile im Tageseditor öffnet einen einheitlichen Dialog „Kommentar bearbeiten“
- Änderungen aus dem Tageseditor werden zunächst nur vorgemerkt und erst mit „Tag speichern“ dauerhaft gespeichert
- Plus-Menü auf „Heute“ und „Zeiten → Tag“ enthält „Kommentar eintragen“ beziehungsweise „Kommentar bearbeiten“
- Datumsbezug im Kommentar-Dialog ist eindeutig; rückwirkende Kommentare werden dem ausgewählten Tag zugeordnet
- vorhandene Kommentare werden auf „Heute“ und „Zeiten → Tag“ kompakt angezeigt und sind antippbar
- lange Kommentarvorschauen werden sicher gekürzt; vollständiger Text bleibt im Dialog bearbeitbar
- erweiterte Aktionen im Tageseditor bleiben vollständig sichtbar und werden beim Aufklappen in den sichtbaren Bereich gescrollt
- nicht verfügbare Aktionen werden ausgeblendet oder eindeutig deaktiviert erklärt
- Buchungszeilen zeigen tatsächliche und dokumentierte Uhrzeit ohne abgeschnittene Texte
- Dialogbreiten, Touch-Ziele und horizontale Überlauffreiheit für iPhone 16 geprüft

Unverändert enthalten:
- einheitlicher kalenderbasierter Rechenkern aus V5.27
- Kommen/Gehen, Rundung, Pausen, Abwesenheiten und Zeitkonto
- Auswertungen, Diagramme, PDF, Excel, Sicherungs-ZIP und JSON-Wiederherstellung
- vollständige Offlinefähigkeit ohne externe Bibliotheken oder Dienste
