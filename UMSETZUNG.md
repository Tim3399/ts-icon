# Umsetzung des Audits

Stand: 10. September 2026. Ausgangspunkt: Commit `30b32029dbea26dc77e29af24ddeecfac66743ce`.

Die Änderungen wurden in drei parallelen Arbeitspaketen für Backend, Oberfläche und Betrieb umgesetzt. Der Hauptagent hat die Schnittstellen zusammengeführt, Sicherheits- und Diagnosecode überarbeitet und die Änderungen unabhängig geprüft. Der ursprüngliche Befund in [AUDIT.md](AUDIT.md) beschreibt den Zustand **vor** diesen Änderungen; seine alten Zeilennummern sind deshalb keine Referenz auf den aktuellen Code.

## Was sich für Benutzer ändert

- Kanäle werden über ihre TeamSpeak-ID ausgewählt und bearbeitet. Gleiche Namen in unterschiedlichen Zweigen überschreiben sich nicht mehr. Umbenennungen ändern die öffentliche Bildadresse nicht.
- Die Galerie bietet Suche, Bildstatus, verständliche Fehler und getrennte Sperren für gleichzeitig bearbeitete Kanäle. Neue Bilder erscheinen unmittelbar; Spacer können wieder auf ihr Basisbild zurückfallen.
- Der Cropper bietet sichtbare Tastaturbedienelemente und behält den Bildausschnitt beim Vergrößern und bei einer Änderung der Fensterbreite.
- Wallpaper-Erzeugungen werden gespeichert. Nach einem Reload oder Timeout bleiben Fortschritt und Teilergebnisse abrufbar. Fortsetzen und Rückgängigmachen beziehen sich auf genau einen Vorgang.
- Undo prüft Besitzmarker, Kanalname, Elternkanal und Banneradresse. Belegte oder nachträglich geänderte Kanäle werden nicht zwangsgelöscht. Unklare Ergebnisse einer TeamSpeak-Erzeugung bleiben zur manuellen Prüfung erhalten.
- Fehler enthalten sichere Meldungen und eine Request-ID. Validierungsfehler werden dem betroffenen Eingabefeld zugeordnet. Anmeldung, Rollenaktualisierung, abgebrochene Downloads und Wiederholungen sind in der Oberfläche berücksichtigt.

## Umsetzung nach Plan

| Paket                       | Umsetzung im Repository                                                                                                                                                                                                                  | Noch erforderliche Abnahme                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 0 – Prüfbasis und Daten     | Windows-SQLite-Testsetup, konsistente Pfadauflösung, Migrations-Dry-run, Online-Backup und geprüfter Restore; konservative Bestandsanalyse und CID-Zuordnung                                                                             | Dry-run und Backup mit den tatsächlichen Bestandsdaten vor deren Upgrade             |
| 1 – Kanalidentität          | Interne Bild-ID, eindeutige CID, Legacy-Aliase, Kollisionsfehler, vollständige Kanalsnapshots, ETag-Revalidierung und Cache-Invalidierung                                                                                                | Banneranzeige im verwendeten TeamSpeak-Client                                        |
| 2 – Wallpaper               | Persistente Runs und Zeilen, Idempotenzschlüssel, atomare Lease-Übernahme, Besitzmarker, Resume, sicheres Undo, begrenzte Speicherung und Bildverarbeitung                                                                               | Marker-, ChannelInfo- und Nicht-Zwangslöschungsverhalten am eigenen TeamSpeak-Server |
| 3 – Sicherheit und Diagnose | Aktualisierte Abhängigkeiten, ein Downloadzeitlimit für DNS/Redirects/Body, deaktivierte Umgebungs-Proxys, genaue Proxyfreigabe, Loopback-Modus, Binärredaktion, HTTP-/DB-Metriken, gemeinsame Tokenprüfung und Swagger-Zugang           | Anmeldung und Rollen mit dem tatsächlichen Keycloak-Realm                            |
| 4 – Bedienung               | CID-Auswahl, Suche/Filter, Uploadkomponente, Cropper, zugängliche Navigation, Vorgangsübersicht, Fehler/Retry, Ressourcen-Cleanup und Not-found-Seite                                                                                    | Kurzer fachlicher Durchlauf mit den eigenen Kanälen                                  |
| 5 – Betrieb                 | Injizierbare Kanal-/Import-/Wallpaper-Dienste, Bootstrap für beide Apps, getrennte Watch-Ausgaben, Compose mit Frontend, Migration vor Start, schlankes Runtime-Image, Konfigurationsprüfung, CI für Windows/Linux und Browser/Container | Finale Linux-/Containerprüfung sowie CI-/Registry-Abnahme in der eigenen Umgebung    |

## Formatierung wie QuiltOR

Übernommen wurden die Regeln aus dem benachbarten `quiltor/quiltor`-Projekt:

- Biome **2.5.7** formatiert JavaScript, TypeScript, JSX/TSX, JSON und CSS.
- Zwei Leerzeichen, 100 Zeichen Zeilenbreite, LF, doppelte Anführungszeichen, Semikolons, abschließende Kommas und Klammern um Arrow-Parameter.
- Prettier **3.9.6** übernimmt Markdown, YAML und HTML mit 100 Zeichen, zwei Leerzeichen, LF und `proseWrap: preserve`. Beide Formatter sind auf exakte Versionen festgelegt.
- `.editorconfig` und `.gitattributes` legen Editor- und Checkoutregeln fest. TypeScript-ESLint prüft weiterhin Codequalität und Typverwendung.
- `npm run format` schreibt die Formatierung; `npm run check:format` prüft sie. Die Formatierung umfasst Backend und Frontend.

Die ergänzende Standardadoption vom 10. September ist im [Projektprofil](docs/PROJECT_PROFILE.md) festgehalten. Lockfiles und die unveränderliche Standardkopie sind von Formatterschreibzugriffen ausgenommen; Prettier formatiert keine eingebetteten Codeblöcke. Die dort als offen dokumentierten Anforderungen an Start-/Buildidentität, Doctor und lokale Versionierung bleiben eigene Folgearbeiten.

## Prüfprotokoll

Die Prüfungen vom 9. September wurden nach den letzten Service- und Abhängigkeitsänderungen unter Windows mit Node 22.23.2 und npm 10.9.8 ausgeführt. Die Testfälle verwenden isolierte Datenbanken und lokale Testserver.

| Prüfung                         | Ergebnis                              | Aussage                                                                                                                                       |
| ------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Backendtests                    | **360 Tests in 38 Suites bestanden**  | Einschließlich 15 echter SQLite-/HTTP-Tests für Wallpaper und Recovery, Cache-Isolation zwischen Nest-Kontexten und strukturierter Feldfehler |
| Backend-Build und ESLint        | **Bestanden, keine Lintbefunde**      | Typprüfung einschließlich geteilter Konfiguration und Wartungsskripte                                                                         |
| Backend-E2E                     | **2 Tests bestanden**                 | Liveness und nicht authentifizierter Zugriff                                                                                                  |
| Betriebsskripte unter Windows   | **5 Tests bestanden**                 | Echte Migration, Backup, Restore und simulierte Release-Wiederholungen/Teilfehler                                                             |
| Start des kompilierten Backends | **Bestanden**                         | Readiness, Swagger/OAuth-Konfiguration, Proxy-Zugriffsschutz und sichere Parserfehler                                                         |
| Multer nach dem Override        | **HTTP-Smoke bestanden**              | Upload 201, Dateigrößenlimit 413 und unbekanntes Multipart-Feld 400 über Nest                                                                 |
| npm-Sicherheitsprüfung          | **0 Befunde in allen vier Berichten** | Beide vollständigen Lockfiles und beide Produktionsgraphen, nach den letzten Updates                                                          |

Abschluss am 10. September:

| Ausgeführter Befehl                                                                                                        | Ergebnis                                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm.cmd test --prefix webapp-banner-tool`                                                                                 | **107 Tests in 13 Dateien bestanden**                                               |
| `npm.cmd run build --prefix webapp-banner-tool`                                                                            | **Bestanden**; TypeScript und Vite, synthetische Keycloak-Buildwerte wie in CI      |
| `npm.cmd run test:e2e --prefix webapp-banner-tool -- --output <temporäres Browserverzeichnis>` mit `TS_ICON_E2E_PORT=5187` | **16/16 Chromium-Abläufe bestanden**; Desktop, Mobilansicht, Tablet und Zoom-Layout |

Die Browserabläufe prüfen den echten Cropper, 500×44-PNG-Ausgabe, identischen Ausschnitt nach Vergrößerung, CID-Zuordnung, Galerie und einen Tab-/Tastaturdurchlauf einschließlich Navigation und Löschung. Betriebssystemdialoge werden vom Testrunner beantwortet. Das Zoom-Projekt bildet 1280×900 bei 200 % Zoom durch 640×450 CSS-Pixel und Pixeldichte 2 nach; ein manueller Browserzoom- oder Screenreadertest ist damit nicht behauptet. Der Standardport 5178 war durch QuiltOR belegt, dessen Prozess unverändert weiterlief. Testserver und Basisadresse wechselten gemeinsam auf den eigenen strikten Port 5187.

Die letzten Frontendlogs und Browserartefakte liegen unter `%TEMP%/CodexWork-ts-icon-final-audit/`. Die vorherigen Backend-Nachweise bleiben gültig; der letzte funktionale Fix betrifft ausschließlich den Cropper und seinen Regressionstest.

Der abschließende `npm.cmd run check` bestand: Biome prüfte 190 Dateien, Prettier alle passenden Dokumente; Backend und Frontend bestanden ESLint und Typprüfung. Auch `git -c safe.directory=C:/Users/timra/git/ts-icon diff --check` bestand. Die gespeicherten Mobil-, Tablet- und Zoom-Ansichten wurden zusätzlich visuell geprüft. Der Browserlauf wurde vom Hauptagenten nach dem Agentenfix unabhängig ausgeführt.

Am 8. September waren zusätzlich drei Containerimages, Linux-Backendtests sowie der zusammenhängende Container-Smoke mit Migration, Backup/Restore, Dateieigentümer, Readiness, PNG/ETag über nginx, Zugriffsschutz und schlankem Runtime-Image erfolgreich. **Diese Ergebnisse gehören zum damaligen Stand und ersetzen keinen Containerlauf nach den Änderungen vom 9. September.**

Der erneute Linux-/Containerlauf konnte nicht starten: Am 9. September beendete sich Docker Desktop beim Inference-Manager, weil es auf `C:/Users/timra/AppData/Local/Docker/run/dockerInference` nicht zugreifen konnte. Bei beendetem Docker wurde ausschließlich die reversible Umbenennung dieses einzelnen verwaisten 0-Byte-Socketeintrags versucht; Windows verweigerte auch das. Es entstanden weder ein Quarantäneziel noch Änderungen an Docker-Daten oder -Einstellungen. Am 10. September scheiterte `docker info` erneut an der fehlenden Named Pipe `dockerDesktopLinuxEngine`. Nach Wiederherstellung des Docker-Starts müssen die finalen Images und Linuxprüfungen erneut ausgeführt werden.

Am 10. September erneut ausgeführt: `npm.cmd audit --audit-level=high`, `npm.cmd audit --prefix webapp-banner-tool --audit-level=high`, `npm.cmd run audit:production` und `npm.cmd run audit:production --prefix webapp-banner-tool`. Alle vier Befehle endeten mit Exitcode 0 und null Befunden; beide Lockfiles blieben unverändert. Nachweise liegen unter `%TEMP%/CodexWork-ts-icon-final-audit/`.

Die Browserprüfungen verwenden die echte React-Oberfläche und Cropper.js mit simulierten API-Antworten. Backend-Integrationstests verwenden echte SQLite-/HTTP-/PNG-Verarbeitung und simulieren TeamSpeak. Diese Nachweise ersetzen weder einen tatsächlichen Keycloak-Login noch die fachliche Abnahme am eigenen TeamSpeak-Server.

## Änderungen aus der unabhängigen Prüfung

Die Agentenergebnisse wurden nach der Implementierung zusätzlich geprüft. Dabei wurden unter anderem folgende Fehler gefunden und nachgebessert:

- Eindeutige Altbilder müssen beim ersten CID-Upload übernommen werden; ein veralteter Kanalsnapshot darf keine falschen Namenskollisionen hinterlassen.
- Eine inzwischen abgeschlossene Undo-Operation darf durch einen konkurrierenden Resume-Aufruf nicht erneut gestartet werden.
- Bei verlorener Löschantwort muss die rekonstruierte CID bereits gespeichert sein. Ein Lease-Wechsel während der Kanalprüfung darf keine anschließende Löschung mehr erlauben.
- Ältere offene Vorgänge dürfen durch mehr als 50 neuere abgeschlossene Vorgänge nicht aus der aufräumbaren Historie verschwinden.
- TeamSpeak-Kommandos und Verbindungsaufbau brauchen eigene Fristen; ein offener TCP-Socket allein garantiert keine Antwort. Nach Ablauf werden Verbindung und Folgekommandos beendet.
- Fehlerhafte und zu große JSON-Bodies müssen bereits vor dem Bodyparser Request-IDs und HTTP-Metriken erhalten.
- Ein lokaler Reverse-Proxy darf den Loopback-Zugang zu Swagger oder zum Entwicklungsmodus nicht versehentlich öffnen.
- Auch Vorgänge ohne bereits gespeicherte CIDs brauchen eine sichere Aufräumaktion. Galerie-Retry und Spacer-Fallback müssen nach einer erfolgreichen Änderung ihren Zustand aktualisieren.
- API-Basisadressen dürfen keine Query oder Fragmente enthalten. Der vorgeschaltete Proxy muss die längeren Wallpaper-Anfragen berücksichtigen.
- Erst wenn beide Release-Images gebaut sind, dürfen ihre gemeinsamen Release-Tags veröffentlicht werden.
- Ein Update des direkten Multer-Pakets ersetzt nicht automatisch den von Nest festgelegten verschachtelten Parser. Dieser Abhängigkeitszweig wurde separat korrigiert und über HTTP geprüft.
- Feldfehler müssen erhalten bleiben, wenn die Oberfläche einen unbekannten Feldnamen empfängt. Ein Wechsel von ungültiger Datei zu gültiger URL oder Galerie-Drop muss alte Fehlermarkierungen und Fokusanforderungen verwerfen.
- Bei der Größenänderung des Croppers muss Speichern bis zum Ready-Signal der neuen Instanz gesperrt bleiben. Verspätete Signale zerstörter Instanzen werden durch eine Generationskennung verworfen; der Regressionstest prüft auch den Übergang von bereits bereit zu erneut unbereit.

## Vor dem Upgrade einer bestehenden Installation

1. Eine konsistente Sicherung außerhalb des einzigen Datenvolumes anlegen und die Wiederherstellung an einer zweiten Datenbank prüfen.
2. Migrations-Dry-run durchführen. Für die CID-Bestandsanalyse eine separate Testkopie wiederherstellen und dort zuerst die neue Migration anwenden: Das Backfill-Werkzeug benötigt das neue ID-/Alias-Schema. Mehrdeutige Namen und verwaiste Bilder werden gemeldet und nicht automatisch gelöscht oder willkürlich zugeordnet.
3. Im Wartungsfenster die neue Migration anwenden, den CID-Dry-run prüfen und nur freigegebene eindeutige Zuordnungen übernehmen. Beide Apps mit zueinander passenden Image-Versionen starten. Die Readiness prüft alle fünf erforderlichen Tabellen ohne Bild-BLOBs zu laden.
4. Mit Admin und Editor anmelden; Upload, Umbenennung, öffentliche CID-Adresse, eine kleine Wallpaper-Generierung und Undo am eigenen Server prüfen.

Die produktive Datenbank, TeamSpeak-Kanäle, Keycloak-Einstellungen und die Registry wurden während dieser Umsetzung nicht verändert.
