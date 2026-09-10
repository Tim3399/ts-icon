# Projekt-Audit und Maßnahmenplan

Stand: **08.09.2026** · Projekt: **ts-icon 0.8.0** · geprüfter Commit: `30b32029dbea26dc77e29af24ddeecfac66743ce`

> Dieses Audit dokumentiert den ursprünglichen Zustand vor der Umsetzung. Befunde, Zeilennummern und die damaligen Prüfergebnisse unten bleiben als Ausgangsbasis erhalten. Den aktuellen Implementierungsstand und die nachträglichen Prüfungen beschreibt [UMSETZUNG.md](UMSETZUNG.md). Der Maßnahmenplan am Ende wird anhand dieser Nachweise fortgeschrieben.

## Einschätzung

Die Architektur ist für ein überschaubares TeamSpeak-Verwaltungswerkzeug brauchbar. Getrennte öffentliche und administrative APIs, Rollenprüfungen, echte Bilddekodierung, Prisma-Migrationen, Containerbetrieb und automatisierte Tests sind bereits vorhanden. Ein vollständiger Rewrite ist nicht erforderlich.

**Der aktuelle Stand ist jedoch noch nicht zuverlässig genug für die beworbenen Kernabläufe.** Insbesondere Wallpaper-Erzeugung, Rückgängig-Funktion, Kanalidentität und Bildaktualisierung haben zusammenhängende Funktionsfehler. Mehrere Tests bestätigen einzelne Implementierungsdetails, ohne zu prüfen, ob das erzeugte Banner anschließend tatsächlich abrufbar ist. Dazu kommen Betriebshürden und bekannte verwundbare Abhängigkeiten.

Die sinnvollste Reihenfolge lautet: **Datenkonsistenz und Wiederherstellung → Sicherheits- und Ressourcenfehler → verständliche, zugängliche Bedienung → zuverlässiger Start und Betrieb → gezieltes Aufräumen.** Die Arbeitspakete am Ende dieses Dokuments sind dafür direkt verwendbar.

## Umfang und Nachweis

Geprüft wurden Backend, React-Frontend, Tests, Prisma-Schema und Migrationen, Konfiguration, Start-/Installationsskripte, Dockerfiles, Compose, CI und Dokumentation. Drei unabhängige Teilprüfungen für Domänenlogik, Frontend und Betrieb wurden mit einer zusätzlichen Prüfung von Authentifizierung, HTTP-Verhalten, Abhängigkeiten und ausführbaren Checks zusammengeführt.

Die Befunde unterscheiden zwischen **reproduziert**, **durch Code belegtem Fehler** und **Risiko/Verbesserung**. Die Prüfung umfasst keinen Zugriff auf einen echten TeamSpeak-Server, keinen echten Keycloak-Login und keinen Test einer produktiven Installation. Layout- und Tastaturbefunde stammen aus dem Code; ein visueller Browserdurchlauf wurde nicht durchgeführt. Ein Audit kann weitere Fehler nicht ausschließen.

Produktcode und Lockfiles wurden nicht geändert. Für die Prüfung wurden die festgelegten Abhängigkeiten installiert, der Prisma-Client und Buildausgaben erzeugt sowie temporäre Logs und Testdaten unter `.tmp/` angelegt.

### Ausgeführte Checks

Umgebung: Windows, Node **22.23.2**, npm **10.9.8**. Das Manifest nennt npm **11.7.0**; diese Abweichung ist bei der Reproduktion zu beachten. Der vorhandene npm-PowerShell-Starter war zunächst defekt; ausgeführt wurde die funktionierende npm-CLI der Node-Installation.

| Prüfung                                                        | Ergebnis                                                          | Einordnung                                                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Installation beider Lockfiles mit `npm ci`                     | Erfolgreich                                                       | Netzwerkzugriff außerhalb der Sandbox erforderlich                                                                 |
| `prisma generate`                                              | Erfolgreich                                                       | Prisma Client 7.3.0                                                                                                |
| Backend `npm run build`                                        | Erfolgreich                                                       | TypeScript-Kompilierung enthalten                                                                                  |
| Backend `npm run lint`                                         | **10.085 Fehler**                                                 | Ausschließlich CRLF/LF-Konflikte; rein diagnostischer Lauf mit `endOfLine: auto` ergibt **0 Fehler / 0 Warnungen** |
| Backend `npm test -- --runInBand`                              | **292 bestanden, 13 fehlgeschlagen**; 29/30 Suites bestanden      | Alle 13 Fehler entstehen im gemeinsamen Setup der SQLite-Integration; außerhalb der Sandbox identisches Ergebnis   |
| Backend `npm run test:e2e -- --runInBand`                      | **2/2 bestanden**                                                 | Testet Liveness und fehlendes Token, keinen erfolgreichen Bildworkflow                                             |
| Frontend `npm run build`                                       | Erfolgreich                                                       | TypeScript und Vite; ca. 323 kB JS / 102 kB gzip                                                                   |
| Frontend `npm run lint`                                        | Erfolgreich mit **3 Warnungen**                                   | Gemischte Komponenten-/Hook-Exports bei Fast Refresh                                                               |
| Frontend `npm test`                                            | **86/86 bestanden**, 11 Suites                                    | Build/Teststart mussten wegen Esbuild-Dateisystemrechten außerhalb der Sandbox erfolgen                            |
| SQLite-Kontrollprobe                                           | Alle **3 Migrationen** erfolgreich bei vorab angelegter leerer DB | Derselbe CLI-Aufruf scheitert bei noch nicht existierender DB-Datei; siehe A15                                     |
| Lokale Domänenproben                                           | Mehrere Fehler reproduziert                                       | Echte Controller/Services/Sharp, simulierte TeamSpeak-/DB-Zugriffe                                                 |
| Lokale HTTP-Proben                                             | Proxy-/Timeout- und Metrikfehler reproduziert                     | Ausschließlich lokale Stubserver; keine fremden Ziele                                                              |
| Docker-Imagebau/-Start, echter Login und TeamSpeak-Integration | Nicht ausgeführt                                                  | Diese Prüfungen sind Teil des Abnahmeplans                                                                         |

Die Standardprüfungen wurden nicht durch Produktänderungen „grün gemacht“. Besonders die fehlgeschlagenen Integrationstests bleiben als offener Befund bestehen.

### Abhängigkeiten: aktueller npm-Abgleich

Ausgeführt wurden `npm audit --package-lock-only --json` und zusätzlich `--omit=dev`, jeweils für beide Anwendungen.

| Lockfile / Umfang                 | Low | Moderate | High | Critical | Gesamt |
| --------------------------------- | --: | -------: | ---: | -------: | -----: |
| Backend, vollständig              |   3 |       33 |   27 |        4 | **67** |
| Backend, ohne Dev-Abhängigkeiten  |   0 |       11 |   19 |        0 | **30** |
| Frontend, vollständig             |   2 |        2 |   13 |        0 | **17** |
| Frontend, ohne Dev-Abhängigkeiten |   0 |        0 |    2 |        0 |  **2** |

Das sind die von npm gezählten betroffenen Pakete einschließlich Abhängigkeitsketten, **keine Zahl unabhängig nachgewiesener ausnutzbarer Projektlücken**. Insbesondere React-Router-Meldungen zu SSR-/Serverfunktionen sind nicht automatisch auf diese Browser-SPA übertragbar. Vite-Meldungen betreffen primär Entwicklungs-/Buildbetrieb. Auch der Produktionsgraph muss mit dem Inhalt des fertigen Containerimages abgeglichen werden: optionale Peer-Abhängigkeiten führen hier beispielsweise Prisma-Werkzeuge mit.

Relevante gesperrte Versionen sind unter anderem `multer 2.0.2`, `axios 1.9.0`, Nest-Pakete aus `11.1.x`, `react-router-dom 7.6.2` und `vite 6.3.5`. Multer liegt tatsächlich im Uploadpfad. Eine bestätigte Maintainer-Meldung betrifft unkontrollierte Rekursion bei fehlerhaften Requests in Versionen vor 2.1.1; der vollständige npm-Abgleich enthält weitere Meldungen. Ein Upgrade muss deshalb gegen den gesamten aktuellen Bericht geprüft werden, nicht nur gegen diese eine Mindestversion. [Multer-Sicherheitsmeldung](https://github.com/expressjs/multer/security/advisories/GHSA-5528-5vmv-3xc2)

## Prioritäten

- **P1:** vor breiterer Nutzung beheben; Kernfunktion defekt, erhebliche Konsistenz-/Betriebsprobleme oder relevante Sicherheits-/Ressourcenrisiken.
- **P2:** im nächsten Stabilisierungsschritt; klarer Fehler oder deutliche Bedienhürde.
- **P3:** Wartbarkeit, Robustheit und Politur; nach den Kernabläufen bearbeiten.

Es wurde kein bedingungsloser P0-Notfall nachgewiesen. Die Priorisierung unten berücksichtigt die tatsächliche Nutzung und die vorhandenen Rollenprüfungen.

## A — Kernfunktion, Sicherheit und Betrieb

### A01 · P1 · Generierte Wallpaper-URLs liefern 404 — reproduziert

**Belege:** [Generierung](C:/Users/timra/git/ts-icon/src/images/channel-wallpaper.controller.ts:259), [Banner-URL](C:/Users/timra/git/ts-icon/src/teamspeak/teamspeak-channels.ts:243), [öffentlicher Abruf](C:/Users/timra/git/ts-icon/src/images/images.controller.public.ts:60).

Die Generierung speichert rohe Namen wie `Wall 1`; die Banner-URL und der öffentliche Abruf verwenden dagegen `wall-1`. Die lokale Probe erzeugte erfolgreich zwei Kanäle mit den DB-Schlüsseln `Wall 1` und `Wall spacer 1`; der anschließende Abruf von `wall-1.png` ergab 404. Auch die Kollisionsprüfung verwendet die falsche Namensform.

**Änderung:** Kurzfristig dieselbe kanonische Normalisierung für Prüfung und Speicherung verwenden. Dauerhaft Kanal-ID, Anzeigename und URL trennen, siehe A05. Vorhandene Rohschlüssel mit Konfliktbericht migrieren.

**Abnahme:** Generate → sämtliche zurückgegebenen Banner-URLs abrufen → 200, PNG und erwartete Bildabmessungen. Vorhandene kollidierende Daten dürfen nicht überschrieben werden.

### A02 · P1 · Teilfehler bei der Generierung verlieren das wiederherstellbare Ergebnis — reproduziert

**Beleg:** [Erzeugung und anschließende Speicherung](C:/Users/timra/git/ts-icon/src/images/channel-wallpaper.controller.ts:282).

Zuerst werden TeamSpeak-Kanäle erzeugt, danach die Bilder gespeichert. Bei einem DB-Fehler verschwinden die bereits erzeugten CIDs aus der Antwort. Die Probe erzeugte zwei Kanäle, ließ den ersten Speichervorgang scheitern und erhielt ausschließlich 503 mit „TeamSpeak is currently unreachable“. Es gibt weder einen nachvollziehbaren DB-Fehler noch ein brauchbares Undo-Ergebnis. Ein Clienttimeout oder Reload verschärft das Problem, weil kein abrufbarer Vorgangsstatus existiert.

**Änderung:** Einen persistenten Generierungsvorgang mit ID, Benutzer, Status und Ergebnissen je Kanal einführen. Wiederholungen über Idempotenzschlüssel erkennen; Status und Wiederaufnahme anbieten. DB-Schreibvorgänge sinnvoll transaktional bündeln und TeamSpeak-Änderungen über protokollierte Ausgleichsaktionen absichern. Eine DB-Transaktion allein kann externe TeamSpeak-Mutationen nicht zurückrollen.

**Abnahme:** Fehler nach Kanal 1, nach Kanal 2 und während Speicherung gezielt auslösen. Jeder bereits erzeugte Kanal bleibt im Ergebnis auffindbar und kann sicher fertiggestellt oder entfernt werden; erneutes Senden erzeugt keine Duplikate.

### A03 · P2 · Undo lässt Bilder zurück und verliert im Frontend den Restzustand — reproduziert / Codebeleg

**Belege:** [Backend-Undo](C:/Users/timra/git/ts-icon/src/images/channel-wallpaper.controller.ts:428), [Löschhelper](C:/Users/timra/git/ts-icon/src/teamspeak/teamspeak-channel-admin.ts:67), [Frontend-Ergebnisverwaltung](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/ChannelWallpaperGenerator.tsx:157).

Undo entfernt ausschließlich TeamSpeak-Kanäle. In der Probe blieben beide Bilder erhalten; derselbe Präfix scheiterte beim nächsten Generate mit 409. Das Frontend verwirft zudem bei teilweise fehlgeschlagenem Undo das komplette Resultat. Auch ein neuer, später fehlgeschlagener Generate-Versuch löscht bereits vor dem Request den vorherigen Erfolg aus dem UI und damit dessen Undo-Möglichkeit.

**Änderung:** Erfolgreich entfernte Kanäle und ihre zugehörigen Bilder gemeinsam nachführen. Fehlgeschlagene Teilaktionen mit IDs und Fehlern behalten. Ergebnisse als Vorgangshistorie verwalten und aus A02 nach Reload erneut laden.

**Abnahme:** Generate → Undo → Generate mit gleichem Präfix funktioniert. Teilweise fehlgeschlagenes Undo bleibt erneut ausführbar. Ein gescheiterter neuer Versuch entfernt keine ältere Wiederherstellungsmöglichkeit.

### A04 · P2 · Undo ist nicht auf selbst erzeugte Kanäle begrenzt — Codebeleg

**Belege:** [Undo-DTO](C:/Users/timra/git/ts-icon/src/images/dto/undo-channel-wallpaper.dto.ts:8), [erzwungene Löschung](C:/Users/timra/git/ts-icon/src/teamspeak/teamspeak-channel-admin.ts:73).

Die admin-geschützte Route akzeptiert beliebige CIDs und übergibt sie ohne Zugehörigkeitsprüfung an `channelDelete(cid, true)`. Damit kann eine als „Rückgängig“ bezeichnete Aktion auch bestehende fremde oder belegte Kanäle entfernen. Das ist kein fehlender Authentifizierungsschutz, sondern ein zu weit gefasster destruktiver Funktionsvertrag.

**Änderung:** Run-ID statt frei übergebener CID-Liste akzeptieren; Zugehörigkeit serverseitig prüfen. Nachträgliche Kanaländerungen und Belegung sichtbar berücksichtigen; sichere Löschreihenfolge und Idempotenz vorsehen.

**Abnahme:** Fremde CIDs werden ohne TeamSpeak-Mutation zurückgewiesen. Ein zweites Undo bleibt unschädlich. Nachträglich veränderte Kanäle werden nicht stillschweigend zwangsweise gelöscht.

### A05 · P1 · Kanalidentität ist trotz DB-ID weiter namensabhängig — reproduziert

**Belege:** [Upload-Zuordnung](C:/Users/timra/git/ts-icon/src/images/images.controller.local.ts:155), [Backfill-Zuordnung](C:/Users/timra/git/ts-icon/src/teamspeak/channel-id-matching.ts:38), [Speicherung bei Rename](C:/Users/timra/git/ts-icon/src/images/images.service.ts:115).

Verschiedene reale Namen können auf denselben Slug fallen. Bei `Röhre`/CID1 und `Rohre`/CID2 wählte die Upload-Auflösung den ersten Kanal, der Backfill dagegen den letzten. Beide bekommen dieselbe öffentliche Bild-URL. Auch Umbenennungen sind nur teilweise abgedeckt: Der nächste Upload ersetzt den DB-Namen, die bisher in TeamSpeak hinterlegte URL wird dabei nicht aktualisiert und kann anschließend 404 liefern.

**Änderung:** CIDs in API und Frontend als Auswahl-/Mutationsschlüssel verwenden und eine stabile öffentliche CID-Route mit `.png` anbieten. Anzeigenamen separat speichern. Mehrdeutige Legacy-Slugs explizit als Konflikt behandeln; Backfill mit Dry-run und Konfliktliste. Bestehende URLs über eine Übergangsstrategie erhalten.

**Abnahme:** Gleichnamige Kanäle in verschiedenen Zweigen sowie Umlaute, Sonderzeichen und Umbenennung treffen immer die ausgewählte CID. Migration ordnet zweideutige Datensätze niemals automatisch einem beliebigen Kanal zu.

### A06 · P1 · Wallpaper-Skalierung besitzt kein wirksames Ausgabebudget — belegtes Ressourcenrisiko

**Beleg:** [Prüfung und vollständige Skalierung](C:/Users/timra/git/ts-icon/src/images/wallpaper-slicer.ts:133).

Die Prüfung begrenzt das Quellbild, anschließend wird proportional auf mindestens 500 Pixel Breite skaliert und das gesamte Resultat materialisiert. Erst danach werden die benötigten Zeilen bestimmt. Eine zulässige Quelle mit 1 × 20.000 Pixeln führt rechnerisch zu 500 × 10.000.000, also fünf Milliarden Ausgabepixeln. Die spätere Zeilenbegrenzung schützt diesen vorherigen Schritt nicht. Ein absichtlich gefährlicher Speicher-/Lasttest wurde nicht ausgeführt; ein konkreter Prozessabsturz ist damit nicht nachgewiesen.

**Änderung:** Ausgabedimensionen einschließlich EXIF-Orientierung und Tiefe vor Verarbeitung berechnen und begrenzen. Nur den benötigten Ausschnitt erzeugen. Preview-/Generate-Parallelität und Arbeitsspeicherbudget begrenzen; unnötige vollständige PNG-Zwischenbilder vermeiden.

**Abnahme:** Extrem schmale/hohe Bilder werden vor teurer Verarbeitung verständlich abgewiesen oder begrenzt verarbeitet. Mehrere gleichzeitige Previews dürfen das festgelegte Ressourcenbudget nicht überschreiten.

### A07 · P2 · Gespeicherte Änderungen werden nicht verlässlich sichtbar — Codebeleg

**Belege:** [24-Stunden-Cache](C:/Users/timra/git/ts-icon/src/images/images.controller.public.ts:94), [Galerie-Upload](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/ChannelGallery.tsx:61).

Nach einem Upload bleibt die `img.src` einer bestehenden Galeriekachel gleich. React muss das Bild daher nicht neu laden. Auch nach Remount kann `Cache-Control: public, max-age=86400` bis zu einen Tag lang den alten Inhalt liefern. Das betrifft entsprechend Browser-/Proxycaches und den Livebaum. Ein ETag erzwingt innerhalb der Freshness-Frist keine Revalidierung.

**Änderung:** Für stabile TeamSpeak-URLs kurze Freshness oder Revalidierung definieren. Im Frontend gespeicherte Revision/Hash in die Vorschau-URL aufnehmen und Mutationsergebnisse gezielt aktualisieren. Eine Inhaltsversion im TeamSpeak-Pfad erfordert zusätzlich die zuverlässige Aktualisierung der dort hinterlegten URL.

**Abnahme:** Bild A öffnen, B hochladen, B unmittelbar in Galerie und Livebaum sehen; nach Navigation und erneutem Abruf konsistent. Die maximale Aktualisierungsverzögerung für externe Clients explizit festlegen.

### A08 · P1 bei Proxybetrieb · Proxy-ENV umgehen die geprüfte IP-Bindung — reproduziert

**Beleg:** [Axios-Aufruf](C:/Users/timra/git/ts-icon/src/images/safe-url-fetcher.ts:79).

Der Download übergibt einen gepinnten `httpsAgent`, setzt jedoch kein `proxy: false`. Mit `HTTPS_PROXY=http://127.0.0.1:<Testport>` erreichte die lokale Probe den HTTP-Stubproxy und erhielt erfolgreich dessen Bytes; der abgesicherte Verbindungsaufbau wurde **kein einziges Mal** aufgerufen. Der Proxy erhielt die vollständige HTTPS-Ziel-URL und übernimmt damit Auflösung/Verbindung. Das entspricht Axios' dokumentierter Behandlung von Proxy-Umgebungsvariablen. [Axios-Konfiguration](https://axios-http.com/docs/req_config)

Dies ist **kein nachgewiesener Private-IP-Bypass im Standardbetrieb ohne Proxy**. Die Vorprüfung bleibt aktiv, und die Routen sind rollenbegrenzt. In einer passenden Proxyumgebung gilt die dokumentierte Ziel-IP-Bindung aber nicht mehr; insbesondere eine abweichende Auflösung beim Proxy wird nicht abgefangen.

**Änderung:** Für diesen direkten abgesicherten Transport `proxy: false` setzen. Explizite Proxyunterstützung nur mit einem gleichwertig geprüften Transportmodell anbieten.

**Abnahme:** Gesetzte `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`-Variablen dürfen die verbindliche Zielprüfung nicht verändern.

### A09 · P2 · Timeouts begrenzen nicht die gesamte Operation — reproduziert / Codebeleg

**Belege:** [Backend-Download](C:/Users/timra/git/ts-icon/src/images/safe-url-fetcher.ts:73), [DNS-Auflösung](C:/Users/timra/git/ts-icon/src/images/ssrf-guard.ts:129), [Frontend-Client](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/api/client.ts:103).

Backendseitig startet pro Redirect erneut derselbe Socket-Inaktivitätstimeout; DNS liegt davor ohne eigene Deadline. Lokale Proben: 130 ms konfiguriert, vier Hops erfolgreich nach 378 ms; 50 ms konfiguriert, verzögertes DNS erfolgreich nach 233 ms; 80 ms konfiguriert, kontinuierlicher Body erfolgreich nach 467 ms. Die behauptete Gesamtfrist existiert nicht.

Im Frontend endet der Timer nach Empfang der HTTP-Header; `json()`/`blob()` werden erst danach gelesen. Ein hängender Body kann die Oberfläche weiterhin unbegrenzt warten lassen. Auch die Tokenauflösung liegt vor dem Timer.

**Änderung:** Eine gemeinsame absolute Deadline einschließlich DNS, Redirects und Body verwenden; Transport/Body über AbortSignal abbrechen. Im Frontend externe Abbruchsignale ermöglichen, Fehler beim Bodylesen einheitlich klassifizieren und das Zeitbudget für Tokenrefresh ausdrücklich definieren.

**Abnahme:** Langsames DNS, Redirectketten, kontinuierlich tröpfelnde Antworten und hängende Response-Bodies halten das vereinbarte Zeitbudget ein.

### A10 · P2 · IP-basierte Schutzregeln passen nicht automatisch zu Reverse Proxies — Konfigurationsrisiko

**Belege:** [Public-Bootstrap](C:/Users/timra/git/ts-icon/src/main.public.ts:42), [PrivateNetworkGuard](C:/Users/timra/git/ts-icon/src/metrics/private-network.guard.ts:76), [NoAuthGuard](C:/Users/timra/git/ts-icon/src/auth/no-auth.guard.ts:43), [Admin-Listener](C:/Users/timra/git/ts-icon/src/main.local.ts:188).

Es gibt keine konfigurierte Proxy-Vertrauenskette. Hinter einem lokalen Reverse Proxy ist `req.ip` dessen private Adresse: öffentliche Nutzer können dadurch die Privatnetzprüfung von `/metrics` bestehen, wenn der Proxy diesen Pfad weiterleitet. Gleichzeitig teilen sich Nutzer das öffentliche Rate-Limit unter der Proxy-IP. Express beschreibt dieses Verhalten ausdrücklich. [Express hinter Proxies](https://expressjs.com/en/guide/behind-proxies/)

Der dokumentierte lokale No-Auth-Modus bindet außerdem nicht ausdrücklich an Loopback und lässt private LAN-Adressen zu. `AUTH_DISABLED=true` wird in Produktion korrekt abgewiesen; auf einem erreichbaren Entwicklungsrechner ist die Admin-API dennoch für LAN-Teilnehmer offen.

**Änderung:** Vertrauenswürdige Proxyadressen präzise konfigurieren, Forwarded-Header am Proxy bereinigen und Direktzugriffe entsprechend begrenzen. `/metrics` am Edge sperren oder separat authentifizieren. No-Auth-Modus tatsächlich an Loopback binden; LAN-Freigabe gegebenenfalls als bewusst getrennte Einstellung.

**Abnahme:** Zwei externe Clients erhalten hinter dem vorgesehenen Proxy getrennte Limits; `/metrics` ist extern nicht erreichbar. Gefälschtes `X-Forwarded-For` schafft keine Berechtigung. No-Auth ist von einem zweiten LAN-Gerät nicht erreichbar.

### A11 · P2 · Logs enthalten Binärdaten und vollständige Quell-URLs — Codebeleg

**Belege:** [Prisma-Sanitizer](C:/Users/timra/git/ts-icon/src/prisma/prisma.service.ts:38), [Uint8Array beim Speichern](C:/Users/timra/git/ts-icon/src/images/images.service.ts:105), [URL-Logging](C:/Users/timra/git/ts-icon/src/images/images.controller.local.ts:230).

Der Sanitizer erkennt `Buffer`, gespeichert werden aber `Uint8Array`. Diese werden als Objekt mit sämtlichen Byte-Indizes in `create` und `update` serialisiert. Das vervielfacht Logmenge und verursacht unnötige CPU-/Speicherarbeit. Import- und Proxylogs schreiben außerdem komplette Quell-URLs, einschließlich eventuell darin enthaltener signierter Queryparameter oder sogar abgewiesener eingebetteter Zugangsdaten.

**Änderung:** Binäransichten mit `ArrayBuffer.isView` erkennen und nur Größe/Hash loggen. URL-Query/Userinfo entfernen oder nur Host und interne Request-ID aufnehmen. Auditlogs um Vorgangs-ID und konkrete Resultate ergänzen; Bulk-/Wallpaperaktionen liefern derzeit oft nur `channelName: unknown`.

**Abnahme:** Ein Upload erzeugt weder Bytearrays noch Token-/Signaturparameter im Log. Teilfehler sind anhand einer Vorgangs-ID nachvollziehbar.

### A12 · P2 · HTTP-Metriken übersehen Guardfehler und unbekannte Routen — reproduziert

**Belege:** [Interceptor](C:/Users/timra/git/ts-icon/src/metrics/http-metrics.interceptor.ts:52), [Metrikdefinition](C:/Users/timra/git/ts-icon/src/metrics/metrics.service.ts:29).

Der globale Interceptor registriert seinen `finish`-Listener erst nach den Guards. Daher fehlen dort 401/403/429, die vorher abgewiesen werden; unbekannte 404-Routen durchlaufen ihn ebenfalls nicht. Eine echte Nest-Testanwendung lieferte nacheinander 401, 404 und 200, zählte in `http_requests_total` aber ausschließlich die 200-Antwort. Der separate Auth-Counter zählte die 401 korrekt. Gerade die vorgesehene Auswertung von 429 über die generische Metrik funktioniert damit nicht. [Nest-Request-Lifecycle](https://docs.nestjs.com/faq/request-lifecycle)

**Änderung:** HTTP-Beobachtung früh als Middleware registrieren, endgültigen Status und Route beim Abschluss erfassen. Abbrüche gesondert behandeln. Datenbankfehler aus echten Schreib-/Lesepfaden zählen; aktuell steigt der DB-Fehlerzähler im Wesentlichen bei Readinessfehlern.

**Abnahme:** 200, 400, 401, 403, 404, 429 und 500 erscheinen jeweils genau einmal. Beliebige Pfade erzeugen keine unbeschränkte Anzahl Metriklabels.

### A13 · P1 · Verwundbare Lockfile-Versionen und unnötige Werkzeugketten — npm-Nachweis

**Belege:** [Backend-Abhängigkeiten](C:/Users/timra/git/ts-icon/package.json:25), [Backend-Lockfile](C:/Users/timra/git/ts-icon/package-lock.json:10947), [Frontend-Lockfile](C:/Users/timra/git/ts-icon/webapp-banner-tool/package-lock.json:3754).

Die Ergebnisse stehen in der Abhängigkeitstabelle oben. Authentifizierung reduziert die Angriffsfläche der Uploads, beseitigt Bibliotheksfehler aber nicht. Ein Byte-Limit allein schützt beispielsweise nicht vor allen Multipart-Parserfehlern. Entwicklungswerkzeuge sind getrennt zu behandeln. Das alte Paket `biome` ist außerdem eine andere Werkzeugkette als `@biomejs/biome`; seine Verwendung anhand des vorhandenen `Biomefile` prüfen, bevor ein vermeintliches Formatter-Upgrade geplant wird.

**Änderung:** Laufzeitpakete zuerst kontrolliert aktualisieren, danach Build-/Testwerkzeuge. Für jede verbleibende Meldung Erreichbarkeit und Behandlung dokumentieren. Ungenutzte Werkzeuge entfernen. Einen Dependency-Check mit überprüften Ausnahmen in CI aufnehmen. Kein blindes `npm audit fix --force`: der aktuelle Vorschlag enthält teilweise fachlich ungeeignete Majorwechsel/Downgrades.

**Abnahme:** Keine unbewerteten High-/Critical-Meldungen im ausgelieferten Artefakt; dokumentierte Begründungen für nicht erreichbare Restmeldungen. Build, Upload-/Authregressionen und Containerstart bestehen nach den Updates.

### A14 · P1 · Dokumentierte Dockerupdates können alte Migrationen ausführen — Codebeleg

**Belege:** [Updateanleitung](C:/Users/timra/git/ts-icon/README.md:233), [Migration-Service](C:/Users/timra/git/ts-icon/docker-compose.yml:87), [Builderinhalt](C:/Users/timra/git/ts-icon/Dockerfile:10).

`docker compose run --rm migrate` kann bei vorhandenem Image den alten Builder mit alten Migrationsdateien verwenden. Das folgende `up --build` baut die Anwendungen neu, aber nicht automatisch den ausgeschlossenen Migration-Service im `tools`-Profil. Ergebnis kann ein neuer Backendstand auf altem Schema sein.

**Änderung:** Mindestens `docker compose run --build --rm migrate` verwenden. Ein gemeinsames Updatekommando mit Backup, passender Imageversion, Migration, Start und Readinessprüfung erstellen.

**Abnahme:** Einen vorherigen Release mit Daten installieren, neue Migration einspielen und ausschließlich dem dokumentierten Updateweg folgen. Die neue Schemastruktur ist vor Start der neuen Anwendung vorhanden.

### A15 · P2 · Frischer lokaler Start und Windows-SQLite-Neuanlage funktionieren nicht durchgehend — reproduziert / Codebeleg

**Belege:** [Quickstart](C:/Users/timra/git/ts-icon/README.md:37), [Startskripte](C:/Users/timra/git/ts-icon/package.json:11), [Integrationstest-Setup](C:/Users/timra/git/ts-icon/src/images/images.service.integration.spec.ts:49), [Prisma-Konfiguration](C:/Users/timra/git/ts-icon/prisma.config.ts:10).

Der Quickstart springt von `npm install` direkt zu `start:public/local`, obwohl diese Dateien in `dist/` voraussetzen. Konfigurationsanlage, Prisma-Generierung, Migration und Build fehlen im vollständigen Ablauf. Installationsskripte lösen diese Voraussetzungen ebenfalls nicht geschlossen.

Zusätzlich scheiterte Prisma 7.3.0 unter dem geprüften Windows-System beim Migrieren einer noch nicht existierenden SQLite-Datei. Bei gleichem absoluten Pfad und identischem CLI-Aufruf funktionierten alle drei Migrationen, sobald eine leere 0-Byte-Datei vorher angelegt war. Genau die nicht existierende Datei verwendet das Setup der 13 fehlgeschlagenen Integrationstests. Die engere interne Engineursache wurde nicht bestimmt; ein identisches Linuxproblem wird nicht behauptet.

**Änderung:** Einen gemeinsamen Bootstrap mit geprüfter Konfiguration, konsistenter SQLite-Pfadauflösung, sicherer DB-Neuanlage, Migration, Generierung und Build anbieten. Testdatenbank portabel anlegen und Windows in die CI-Matrix aufnehmen. Relative/absolute Pfade und CLI-/Runtimeverhalten vereinheitlichen.

**Abnahme:** Frischer Checkout → dokumentiertes Kommando → drei erreichbare Prozesse. Die komplette SQLite-Suite besteht unter Windows und Linux, jeweils mit neuen und vorhandenen Datenbanken.

### A16 · P2 · Watch-/Debugskripte suchen einen fehlenden Entry Point — Codebeleg

**Belege:** [Scripts](C:/Users/timra/git/ts-icon/package.json:14), [Nest-Konfiguration](C:/Users/timra/git/ts-icon/nest-cli.json:1).

`nest start --watch` und `nest start --debug --watch` nutzen ohne Override den CLI-Entry `main`. Das Projekt besitzt nur `main.local.ts` und `main.public.ts`.

**Änderung:** Explizite Dev-/Debugkommandos für beide Anwendungen mit passender Entry-Konfiguration und ein gemeinsames Startkommando für Backendprozesse plus Frontend.

**Abnahme:** Beide APIs starten, Dateiveränderungen werden übernommen und der gewünschte Prozess ist debuggbar.

### A17 · P2 · Compose ignoriert die TeamSpeak-Adresse und liefert keine UI — Codebeleg

**Belege:** [festes TS_HOST](C:/Users/timra/git/ts-icon/docker-compose.yml:51), [Gesamtstartversprechen](C:/Users/timra/git/ts-icon/README.md:22), [vorhandenes Frontend-Dockerfile](C:/Users/timra/git/ts-icon/webapp-banner-tool/Dockerfile:1).

Compose überschreibt die Betreiberkonfiguration immer mit `TS_HOST=host.docker.internal`. Ein entfernter TeamSpeak-Server oder anderer Container lässt sich so nicht wie dokumentiert konfigurieren. Ein expliziter Linux-Host-Gateway-Weg fehlt. Außerdem startet der empfohlene Gesamtweg nur APIs; das vorhandene Frontendimage ist nicht als Service eingebunden.

**Änderung:** Konfiguriertes TS_HOST respektieren und den Hostzugriff bewusst dokumentieren. Ein vollständiges Compose mit Frontend, konsistenter API-/OIDC-Konfiguration und eindeutigem UI-Einstieg bereitstellen.

**Abnahme:** Ein Betreiber erhält nach dem Start eine funktionierende UI-Adresse; die Channel-Liste nutzt den konfigurierten Server, sowohl außerhalb als auch innerhalb des Docker-Netzwerks.

### A18 · P2 · CI veröffentlicht Frontendimages ohne brauchbare Produktionskonfiguration — Codebeleg

**Belege:** [Publish-Buildargs](C:/Users/timra/git/ts-icon/.github/workflows/ci.yml:295), [Frontenddefaults](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/config.ts:1).

Fehlende Actions-Variablen verhindern die Veröffentlichung nicht. Leere Vitewerte fallen im Code auf localhost-Adressen zurück. Remote-Benutzer kontaktieren dann ihren eigenen Rechner. Diese Werte sind im Bundle eingebaut und lassen sich durch spätere Container-ENV nicht reparieren.

**Änderung:** Produktionskonfiguration vor Build/Publish validieren oder eine bewusst entworfene und validierte Runtime-Konfiguration einführen. Backendseitig ebenfalls URLs, Ports und Protokollwerte prüfen: Ein Tippfehler bei `TS_PROTOCOL` fällt derzeit still auf unverschlüsseltes `raw` zurück; `PUBLIC_BASE_URL` wird praktisch nur auf Vorhandensein geprüft.

**Abnahme:** Fehlende/falsche Produktionswerte führen zu klaren Fehlern vor Veröffentlichung. Derselbe freigegebene Startweg ruft korrekte APIs und den vorgesehenen Keycloak auf.

### A19 · P2 · Fehlgeschlagene Releases sind nicht vollständig wiederholbar — Codebeleg

**Beleg:** [Tagging und Image-Metadaten](C:/Users/timra/git/ts-icon/.github/workflows/ci.yml:225).

Der Git-Tag entsteht vor der Veröffentlichung beider Images. Scheitert diese danach und wird der gesamte Workflow erneut gestartet, setzt der existierende Tag `new_tag=false`; die Versionstags der Images werden dann nicht erneut erzeugt. Ein Abbruch durch die aktivierte Concurrencyregel kann denselben Zwischenzustand erzeugen.

**Änderung:** Veröffentlichung anhand des zum Commit gehörenden Tags und vorhandener Artefakte idempotent machen. Backend-/Frontendartefakte gemeinsam einem Release zuordnen und fehlerhafte Teilveröffentlichungen nachholen können.

**Abnahme:** Publish nach dem ersten Image gezielt abbrechen; erneuter Lauf liefert beide Images unter derselben unveränderten Releaseversion.

### A20 · P2 · Swagger verwendet eine abweichende Authentifizierung und ist im Browser schwer erreichbar — Codebeleg

**Belege:** [Swagger-Middleware](C:/Users/timra/git/ts-icon/src/main.local.ts:67), [API-Guard](C:/Users/timra/git/ts-icon/src/auth/jwt-auth.guard.ts:95).

Die API prüft `azp`, Swagger dagegen `aud`. Ein regulär API-berechtigtes Keycloak-Token kann deshalb an Swagger scheitern. Schon HTML und Assets benötigen einen Bearerheader, ohne dass zuvor eine Loginoberfläche bereitsteht. Der DocumentBuilder deklariert zudem kein Bearer-Security-Schema.

**Änderung:** Eine gemeinsame Tokenverifikation verwenden und einen funktionierenden Docs-Zugang mit dokumentiertem Login-/Tokenweg implementieren. Den vorhandenen Produktionsschutz beibehalten.

**Abnahme:** Ein für die API gültiges Token funktioniert konsistent im Docs-Zugang; die Dokumentation lädt im vorgesehenen Browserablauf und authentifizierte Beispielaufrufe funktionieren.

### A21 · P2 · Fehlerklassifikation verhindert hilfreiche Rückmeldungen — Codebeleg

**Belege:** [Wallpaper-Quellbild](C:/Users/timra/git/ts-icon/src/images/channel-wallpaper.controller.ts:109), [Frontend-Fehlerabbildung](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/api/client.ts:96).

Wallpaper-Import übersetzt `FetchFailedError`, aber nicht `SsrfValidationError`; eine sicher abgewiesene URL endet als 500 statt als verständlicher 400. Der Aufruf liegt vor dem äußeren `try`, die SSRF-Metrik fehlt. Im Frontend werden selbst vorhandene Backendinformationen zu 400/409/413 verworfen und nur numerische Statusmeldungen angezeigt. DB-Fehler werden an mehreren Stellen pauschal als TeamSpeak-Unerreichbarkeit dargestellt.

**Änderung:** Einheitliches Fehlerschema mit Code, sicherer Nachricht, optionalen Feldfehlern und Request-ID. Erwartete Fehler am Feld anzeigen; unerwartete technische Details im Serverlog belassen. Alle Importpfade gleich behandeln.

**Abnahme:** Ungültige Farbe, gesperrte URL, Namenskonflikt, zu große Datei, DB- und TeamSpeak-Ausfall führen zu unterscheidbaren, handlungsfähigen Rückmeldungen.

### A22 · P2 · Cache-Rennen und Disconnectfehler verfälschen erfolgreiche Änderungen — reproduziert

**Belege:** [Cache-Refresh](C:/Users/timra/git/ts-icon/src/teamspeak/teamspeak-channels.ts:145), [Invalidierung](C:/Users/timra/git/ts-icon/src/teamspeak/teamspeak-channels.ts:169), [Disconnect](C:/Users/timra/git/ts-icon/src/teamspeak/teamspeak-channels.ts:74).

Ein alter laufender Abruf kann nach Invalidierung den neuen Cache wieder überschreiben. In der Probe lieferte der neue Abruf `New`, ein später abgeschlossenes altes Promise setzte anschließend erneut `Old` für weitere Nutzer. Zusätzlich kann `await ts3.quit()` im `finally` ein bereits erfolgreiches Mutationsergebnis oder den ursprünglichen Fehler ersetzen. Bulk-Bannerupdates verlieren bei mittlerem Fehler die Teilergebnisliste und überspringen die abschließende Invalidierung.

**Änderung:** Cachegeneration/Promise-Identität vor Schreibzugriff und Cleanup prüfen. Disconnectfehler gesondert protokollieren. Bulkaktionen liefern Ergebnisse pro Kanal; Cacheinvalidierung erfolgt auch nach Teiländerungen.

**Abnahme:** Gesteuerte umgekehrte Promise-Reihenfolge reaktiviert keine alten Daten. Ein fehlgeschlagener Disconnect verwandelt eine erfolgreiche Mutation nicht in ein unbekanntes Ergebnis.

## U — Bedienbarkeit und Frontend

Die folgenden Punkte ergänzen A03/A07/A09/A21; deren Ursachen sollten gemeinsam behoben werden.

| ID / Prio    | Beleg und konkreter Fehler                                                                                                                                                                                                                                                                                                                                  | Änderung und Abnahme                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **U01 / P2** | [Wallpaper-Preview](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/ChannelWallpaperGenerator.tsx:111): Cleanup entfernt nur den Debounce-Timer. Eine langsame alte Antwort kann die Vorschau neuer Eingaben überschreiben; bei Fehler bleibt ein alter Entwurf sichtbar.                                                                      | Laufende Requests abbrechen oder per Entwurfs-ID abgleichen. Veraltete Vorschau kennzeichnen; Generierung mit dem aktuellen Parametersatz verbinden. Test mit umgekehrter Antwortreihenfolge und anschließendem Fehler.                    |
| **U02 / P2** | [versteckte Dateiinputs](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/styles/banner-tool.css:452), [Elternkanalauswahl](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/ChannelTreePreview.tsx:133): `display:none` plus nicht fokussierbare Labels verhindern Tastaturuploads; klickbare `li` verhindern Tastaturauswahl des Zielkanals. | Native zugängliche Inputs oder echte Buttons, sichtbarer Fokus, semantische Auswahl. Alle Uploadstellen und Zielkanäle vollständig mit Tab/Enter/Leertaste bedienen können.                                                                |
| **U03 / P2** | [feste Cropperbreite](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/BannerCropper.tsx:282), [Headerlayout](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/styles/banner-tool.css:45): 400/800 px feste Breite bei maximal 720 px Hauptspalte und Header ohne Umbruch.                                                                     | Breite an Container anpassen, responsive Navigation, Resize behandeln. Browserabnahme bei 375/768/1280 px und 200 % Zoom ohne abgeschnittene Kernaktionen.                                                                                 |
| **U04 / P2** | [Cropper-Neuaufbau](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/BannerCropper.tsx:32): Größenumschaltung zerstört die Instanz und initialisiert ohne Übernahme der Schnittdaten. Der gewählte Ausschnitt geht verloren.                                                                                                                    | Crop-/Zoomzustand vor Resize sichern oder Instanz kontrolliert aktualisieren. Nach Vergrößern/Verkleinern denselben Bildausschnitt exportieren.                                                                                            |
| **U05 / P2** | [Galerie-Operationszustand](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/ChannelGallery.tsx:18): ein einzelner `uploadingChannel` bildet parallele Uploads nicht ab. Delete bleibt teils während Upload aktiv; Drops umgehen Sperren.                                                                                                       | Operationen pro CID verwalten und widersprüchliche Aktionen für denselben Kanal gemeinsam sperren. A/B parallel, A fertig: B bleibt korrekt als aktiv markiert. Upload/Delete desselben Kanals darf nicht von Antwortreihenfolge abhängen. |
| **U06 / P2** | [Tokenrefresh](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/auth/AuthProvider.tsx:75): Keycloak mutiert das Token, der React-Authzustand wird nicht aktualisiert. Rollenwechsel bleiben bis zu einem neuen Provider-Render unsichtbar.                                                                                                                 | Auth-Snapshot nach Refresh synchronisieren. Neue/entzogene Rollen aktualisieren Navigation und Routeguards ohne Reload; Backendautorisierung bleibt maßgeblich.                                                                            |
| **U07 / P2** | [Galerie-Ladefehler](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/ChannelGallery.tsx:36), [Bannerverwaltung](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/BannerUrlManager.tsx:40): fehlgeschlagene Erstabrufe werden nach kurzem Toast wie leere Channel-Listen dargestellt.                                               | Getrennte Zustände für Laden, Fehler und wirklich leer; sichtbarer Retry. TeamSpeak-Ausfall darf nicht „No channels found“ suggerieren.                                                                                                    |
| **U08 / P3** | [Cropper-Ressourcen](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/BannerCropper.tsx:144): Object-URLs werden nicht widerrufen; Unmount-Cleanup für Cropper und Resize-Timer fehlt.                                                                                                                                                          | Object-URLs, Timer und Instanz in Effects aufräumen. Wiederholtes Laden/Navigieren hinterlässt keine wachsende Anzahl Ressourcen.                                                                                                          |
| **U09 / P3** | [Autocomplete](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/ChannelAutocomplete.tsx:71): Combobox-Beziehung/Expanded-/Active-Descendant-Zustand fehlen; Fokusverlust und Wiederöffnen per Tastatur sind unvollständig.                                                                                                                      | Semantik und Tastaturverhalten vervollständigen. Auswahl, Escape, erneutes Öffnen und Tab-Verlassen mit Tastatur und Screenreader nachvollziehbar.                                                                                         |
| **U10 / P3** | [Routes](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/App.tsx:71), [Tree-Modifier](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/styles/banner-tool.css:109): unbekannte URL liefert leeren Hauptbereich; spätere `.channel-tree`-Regel überschreibt `max-height:none` des Panels.                                                                 | Not-found-Ansicht mit Rückweg; CSS-Modifier korrekt priorisieren. Unbekannte Deep Links sind verständlich, Panelhöhe entspricht dem vorgesehenen Layout.                                                                                   |

### Produktverbesserungen nach Stabilisierung

Diese Vorschläge sind keine bereits bewiesenen Defekte, sondern konkrete Schritte zu einer angenehmen Nutzung:

- **Ein klarer Hauptablauf:** Kanal suchen/auswählen → aktuelles Banner sehen → Bild wählen → Ausschnitt einstellen → speichern → tatsächlich gespeichertes Ergebnis sehen. Erweiterte Massen-/Wallpaperaktionen getrennt anbieten.
- **Galerie mit Suche und Statusfiltern:** fehlende/eigene/Spacerbilder unterscheiden, Anzeigenamen erhalten, Bildrequests lazy laden. Für die dokumentierte Größenordnung um 100 Kanäle zunächst messen; Virtualisierung erst bei Bedarf.
- **Vorgänge sichtbar halten:** Fortschritt, Teilfehler, erfolgreiche Ergebnisse und Wiederherstellung dauerhaft auf der Seite anzeigen. Ein Toast reicht für mehrstufige Mutationsergebnisse nicht.
- **Dateifehler früh erklären:** Größen-/Formatprüfung als Nutzerhilfe sowie `FileReader.onerror` und Bildladefehler behandeln. Serverseitige Validierung bleibt bestehen.
- **Sprache und Navigation vereinheitlichen:** Deutsch/Englisch konsistent wählen, aktive Seite markieren, Logo zum Einstieg verlinken. Technische Statusnummern nicht als alleinige Handlungsanweisung verwenden.
- **Betriebszustand verständlich anzeigen:** API, TeamSpeak und Anmeldung mit klaren Fehlerzuständen und Wiederholungsmöglichkeit; technische Diagnosedetails nur bei Bedarf aufklappen.

## T — Wartbarkeit, Tests und technische Schulden

| ID / Prio    | Befund                                                                                                                                                                                                                                                                                                                                               | Konkrete Arbeit                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T01 / P2** | [Prettier](C:/Users/timra/git/ts-icon/.prettierrc:1) erwartet LF, der Windowscheckout enthält CRLF; 10.085 reine Formatfehler verdecken das eigentliche Audit. Eine passende `.gitattributes` fehlt.                                                                                                                                                 | Repositoryweite Zeilenenden per `.gitattributes` festlegen; Normalisierung als getrennten mechanischen Commit durchführen. Standard-Lint muss unter Windows und Linux ohne Diagnoseoverride bestehen.                 |
| **T02 / P2** | [Wallpaper-Test](C:/Users/timra/git/ts-icon/src/images/channel-wallpaper.controller.spec.ts:311) erwartet die falschen Rohschlüssel; [Backfill-Test](C:/Users/timra/git/ts-icon/src/teamspeak/channel-id-matching.spec.ts:86) schreibt „letzter Treffer gewinnt“ fest.                                                                               | Erwartungen am Produktvertrag ausrichten. Generate→Public-GET, Kollisionen und Undo als zusammenhängende Regressionen ergänzen.                                                                                       |
| **T03 / P2** | [Croppertests](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/components/BannerCropper.test.tsx:35) mocken die zentrale Bildfunktion; [E2E](C:/Users/timra/git/ts-icon/test/app.e2e-spec.ts:23) prüft nur zwei Randfälle.                                                                                                                         | Wenige Browsertests mit echtem Cropper und kontrollierter API; tatsächliches PNG und gespeichertes Bild prüfen. Ein isolierter Integrationslauf mit echtem Test-Keycloak/TeamSpeak bleibt zusätzlich nötig.           |
| **T04 / P3** | [großer Admincontroller](C:/Users/timra/git/ts-icon/src/images/images.controller.local.ts:1) und [Wallpapercontroller](C:/Users/timra/git/ts-icon/src/images/channel-wallpaper.controller.ts:1) mischen HTTP, Verbindungsverwaltung, Domänenlogik, Speicherung und Fehlerbehandlung. Modulglobale TeamSpeak-Caches erschweren Tests.                 | Domänendienste für Kanalzugriff, Bildimport und Generierung mit injizierbaren Abhängigkeiten ausziehen. Refactoring an den korrigierten Verträgen entlang, nicht als vorausgehender Komplettumbau.                    |
| **T05 / P3** | Wiederholte Channeltypen, Fetchzustände und Upload-/Drop-Implementierungen; [API-Client](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/api/client.ts:113) spreadet `HeadersInit`, obwohl auch `Headers` und Tupellisten erlaubt sind. Aktuelle Aufrufer nutzen Literale.                                                                         | Gemeinsame DTOs bzw. generierte API-Typen, gezielte Datenhooks und eine zugängliche Uploadkomponente. Header über `new Headers(headers)` normalisieren; derzeit latenten Vertragsfehler absichern.                    |
| **T06 / P3** | [Backend-Prüfskripte](C:/Users/timra/git/ts-icon/package.json:16) erfassen Root-`config.ts` nicht beim Lint; [TS-Includes](C:/Users/timra/git/ts-icon/tsconfig.json:23) lassen Betriebsskripte außen vor.                                                                                                                                            | Verwendete Konfiguration und Backfill-/Startwerkzeuge passend prüfen; separate Tool-TSConfig bei Bedarf. Unbenutzte Compileroptionen und Overrides gezielt überprüfen.                                                |
| **T07 / P3** | README-/CI-Kommentare behaupten u. a. keine Unit-Tests und keine Deletefunktion; `--passWithNoTests` bleibt aktiv. Lange historische Kommentare widersprechen teils dem tatsächlichen Verhalten.                                                                                                                                                     | Dokumentation kürzen und an ausführbaren Verträgen ausrichten; leere Testsuite nicht grün akzeptieren. Wichtige Architekturentscheidungen knapp dokumentieren.                                                        |
| **T08 / P3** | [Starter-CSS](C:/Users/timra/git/ts-icon/webapp-banner-tool/src/index.css:1) ist ungenutzt; drei Fast-Refresh-Warnungen aus gemischten Exporten.                                                                                                                                                                                                     | Verwaiste Dateien entfernen, Context-/Hook-Exports sauber trennen. Keine neue Styling-/Statebibliothek allein zum Aufräumen einführen.                                                                                |
| **T09 / P2** | Die CI sieht Docker-Buildprüfungen vor; ein lokaler Imagebau sowie Start, Upgrade und Wiederherstellung wurden in diesem Audit nicht ausgeführt. Laufender Upgradepfad, Schema-Readiness und Wiederherstellung fehlen als zusammenhängende automatisierte Abnahme. Healthchecks verwenden nur Liveness. Ein dokumentierter Backup-/Restoreweg fehlt. | Container-Smoke-Test, frische und bestehende DB, Readiness nach Migration und ein einmal bewiesener Restore. SQLite bei laufendem Betrieb konsistent sichern; Backup außerhalb des einzigen Datenvolumes aufbewahren. |
| **T10 / P3** | Namenslängen sind nicht über den gesamten Vertrag abgestimmt: Präfixlimit plus generierter Suffix; Publicvalidierung zählt `.png` vor dem Entfernen mit. Außerdem normalisiert ein Name wie `.png` erst nach erfolgreicher Rohprüfung auf leer.                                                                                                      | Kanonische Namen und finalen URL-/TeamSpeak-Namen prüfen; Grenzwerte mit Suffix und Unicode testen.                                                                                                                   |

Weitere gezielte Aufräumpunkte: Readiness sollte keine kompletten Bild-BLOBs über `findFirst()` laden; ein Metadaten-Select genügt. `computeChannelDepth()` kann einen gemeinsamen Index nutzen und fehlerhafte Zyklen erkennen. Request-IDs sollten in Länge und Zeichensatz begrenzt werden. Null erzeugte Wallpaperzeilen brauchen einen eindeutigen Nutzerfehler statt erfolgreicher HTTP-Antwort bei gleichzeitigem Failure-Counter. Diese Punkte sind kleiner als die oben beschriebenen Ablaufprobleme.

## Maßnahmenplan

Status vom 10.09.2026: Abgehakte Punkte sind im Repository umgesetzt und durch die in [UMSETZUNG.md](UMSETZUNG.md) genannten lokalen Prüfungen belegt. Die darunter beschriebenen Abnahmekriterien bleiben der Maßstab für die Releasefreigabe; offene Umwelt- und Installationsprüfungen sind unter Restabnahme separat aufgeführt. Frühere Containerergebnisse gelten ausdrücklich nicht als Prüfung der letzten Änderungen.

### Paket 0 — Prüfbasis und bestehende Daten sichern

- [x] **A15/T01:** Windows-SQLite-Testsetup und Zeilenenden reparieren; vollständige Standardchecks auf Windows ausführen. Der finale Linuxlauf bleibt unter Restabnahme offen.
- [x] **T09:** Konsistentes SQLite-Backup mit Wiederherstellung in eine zweite Testinstanz dokumentieren und einmal durchführen.
- [x] **A01/A05:** Bestandsanalyse als Dry-run implementieren und mit Testdaten prüfen: rohe/normalisierte Namen, doppeldeutige Slugs, fehlende CIDs und verwaiste Bilder melden. Tatsächliche Bestandsdaten siehe Restabnahme.
- [x] Produktregressionen für Generate→GET und Generate→Undo→Generate ergänzen; die ursprünglichen Fehler wurden im Audit vor der Umsetzung reproduziert.

**Abnahme:** Reproduzierbarer Checklauf, wiederherstellbare Testkopie der Daten und überprüfbarer Migrationsbericht. Noch keine automatische Löschung/Zuordnung mehrdeutiger Bestandsdaten.

### Paket 1 — Bilder und Kanalidentität zuverlässig machen

- [x] **A01:** Speicher-/URLvertrag sofort angleichen, inklusive Kollisionsprüfung.
- [x] **A05:** CIDs durch Auswahl, Upload, Delete, Bannerverwaltung und öffentliche URLs führen; Anzeigenamen erhalten.
- [x] Legacy-Aliase und Datenmigration mit expliziter Behandlung von Konflikten implementieren.
- [x] **A07:** Cachepolitik definieren und Galerie/Livebaum nach Mutationen aktualisieren.
- [x] **A22:** Veraltete Cache-Promises und überschreibende Disconnectfehler beheben.

**Abnahme:** Upload, Anzeige, Löschen, Umbenennen und zwei gleichnamige Kanäle funktionieren durchgehend. Jede von der Anwendung ausgegebene Bild-URL löst korrekt auf. Alte Links haben einen dokumentierten Übergangsweg.

### Paket 2 — Wallpaper als wiederaufnehmbaren Vorgang umsetzen

- [x] **A02:** Persistentes Modell für Generierungsvorgang und Kanalaktionen ergänzen; Idempotenz und Statusabfrage anbieten.
- [x] **A03/A04:** Undo auf Vorgang binden, zugehörige Bilder aufräumen, Teilfehler und erneute Versuche unterstützen.
- [x] **A06:** Ausgabepixelbudget vor Skalierung sowie begrenzte Bildverarbeitungsparallelität einführen.
- [x] **U01:** Previewantworten an aktuelle Entwürfe binden; veraltete Ergebnisse sichtbar behandeln.
- [x] Vorgangsübersicht im Frontend mit Fortschritt, Teilergebnissen und Wiederaufnahme nach Reload ergänzen.

**Abnahme:** Erfolgsfall, DB-Fehler nach externer Mutation, TeamSpeak-Teilfehler, Clienttimeout, Reload und teilweise fehlgeschlagenes Undo sind kontrolliert reproduzierbar. Kein Ergebnis geht verloren und kein fremder Kanal wird durch Undo gelöscht.

### Paket 3 — Transport, Sicherheit und Diagnose schließen

- [x] **A13:** Laufzeit- und Werkzeugabhängigkeiten kontrolliert aktualisieren; verbleibende Advisories bewerten.
- [x] **A08/A09:** Proxybehandlung und absolute Deadlines korrigieren, inklusive Bodylesen im Frontend.
- [x] **A10:** Proxyvertrauen, externe Metrics-Sperre und echten Loopback-No-Auth-Modus festlegen.
- [x] **A11/A12:** Binär-/URLredaktion, vollständige HTTP-Metriken und echte DB-Fehlermetriken umsetzen.
- [x] **A20/A21:** Einheitliche Tokenverifikation, nutzbare API-Dokumentation und strukturierte Fehlerantworten herstellen.

**Abnahme:** Uploadparser-, SSRF-/Proxy-, Timeout-, Rollen- und Metrikregressionen bestehen. Kein unbewerteter High-/Critical-Befund im freigegebenen Artefakt; Importfehler erklären dem Nutzer den nächsten Schritt.

### Paket 4 — Die tägliche Bedienung angenehm machen

- [x] **U02/U09:** Alle Kernabläufe per Tastatur zugänglich machen; Fokus- und Screenreadersemantik prüfen.
- [x] **U03/U04:** Responsive Cropper-/Navigationsansicht ohne Verlust des Ausschnitts; 16 Browserabläufe einschließlich Tablet und Zoom-Layout bestanden.
- [x] **U05/U06:** Mutationen pro CID verwalten und Authzustand nach Tokenrefresh aktualisieren.
- [x] **U07/U08/U10:** Dauerhafte Fehler-/Retryzustände, Ressourcen-Cleanup und Not-found-Seite.
- [x] Galerie-Suche/Statusfilter, konsistente Sprache und klaren Hauptablauf ergänzen.

**Abnahme:** Ein neuer Benutzer kann ohne Kenntnis der API einen Kanal finden, ein Banner passend ausschneiden und das gespeicherte Ergebnis eindeutig erkennen. Das funktioniert bei 375 px Breite und ausschließlich per Tastatur. Fehler bleiben sichtbar und sind korrigierbar.

### Paket 5 — Installieren, aktualisieren und warten vereinfachen

- [x] **A14–A18:** Vollständigen lokalen Bootstrap und Compose-Start mit UI, konfigurierbarem TS_HOST, validiertem OIDC/API-Setup und passenden Migrationen liefern.
- [x] **A19:** Releasejob wiederholbar machen und Teilveröffentlichung absichern.
- [x] **T02/T03/T09:** Browserworkflow und Container-Smoke-Test in CI aufnehmen; frische Installation, Upgrade und Restore prüfen.
- [x] **T04–T08:** Domänendienste/DTOs/Uploadkomponente konsolidieren, Prüfumfang vervollständigen und veraltete Dateien/Kommentare entfernen.

**Abnahme:** Eine Person mit Server-/Keycloak-Zugang kann das Projekt über einen dokumentierten Weg starten und aktualisieren. Fehlende Konfiguration wird vor einem unbrauchbaren Release erkannt. Wartungsarbeiten erzeugen klare, überprüfbare Änderungen.

## Mindestabnahme für einen gut nutzbaren Release

### Restabnahme außerhalb der abgeschlossenen Repository-Arbeit

- [ ] Finale Linux-Standardchecks und Containerimages nach den letzten Änderungen bauen und den vollständigen Container-Smoke ausführen. Docker ist aktuell nicht erreichbar; Details im Prüfprotokoll.
- [ ] Backup, Migration und CID-Dry-run mit den tatsächlichen Bestandsdaten in einer separaten Testinstanz prüfen.
- [ ] Tatsächlichen Keycloak-Login mit Admin/Editor und die unten aufgeführten TeamSpeak-Abläufe am eigenen Server abnehmen.
- [ ] Einen echten Screenreader sowie tatsächlichen Browserzoom manuell prüfen; automatisierte Tastatur-/Semantik- und Zoom-Layouttests ersetzen diese Abnahme nicht.
- [ ] Releaseablauf in der eigenen GitHub-/Registry-Umgebung prüfen, bevor die Veröffentlichung als abgenommen gilt.

Die zusätzlichen, noch offenen Anforderungen an Doctor, Start-/Buildidentität und lokale Versionierung aus der Standardadoption sind im [Projektprofil](docs/PROJECT_PROFILE.md#exceptions-and-pending-work) dokumentiert. Sie werden nicht als erledigte Auditmaßnahmen ausgegeben.

### Fachlicher Durchlauf

1. Login mit Admin und Editor; unberechtigter Nutzer kann keine Mutation ausführen. Rollenrefresh aktualisiert die Oberfläche.
2. Kanal mit Umlaut, Sonderzeichen oder gleichem Namen in anderem Zweig auswählen und sicher per CID bearbeiten.
3. PNG/JPEG/WebP hochladen, echten Cropper bedienen, gespeichertes PNG abrufen und unmittelbar in Galerie/Livebaum sehen.
4. Kanal umbenennen; öffentliches Banner bleibt erreichbar.
5. Wallpaper erzeugen; jedes Slice liefert 200. Teilfehler sind abrufbar und nach Reload weiter bearbeitbar.
6. Undo vollständig und teilweise ausführen; nur zugehörige Kanäle/Bilder werden entfernt. Erneute Generation funktioniert.
7. Extremes Seitenverhältnis, kaputte Datei, gesperrte URL, langsamer Download und parallele Requests überschreiten keine festgelegten Budgets.
8. Kernabläufe auf kleinem Bildschirm und per Tastatur abschließen; keine verschwundenen Ergebnisse und keine bloßen Statusnummern als Fehlermeldung.
9. Frische Installation und Upgrade mit realen Migrationen bestehen unter unterstützten Plattformen. Readiness prüft die nutzbare DB.
10. Backup auf separater Testinstanz wiederherstellen und HTTP-/Fehlermetriken mit gezielten 401/403/404/429/500-Proben verifizieren.

Ein neues Framework, eine andere Datenbank oder eine vollständige Neuentwicklung sind dafür zunächst nicht nötig. Entscheidend sind stabile Kanalidentität, nachvollziehbare Vorgänge und Tests, die das sichtbare Ergebnis prüfen.
