<p align="center">
  <img src="docs/banner.png" alt="VidSwap" width="720" />
</p>

Sorteer je videobestanden zoals je swipet op Tinder. VidSwap draait als kleine container op je NAS, speelt je video's willekeurig en automatisch af, en verplaatst ze met één swipe naar de juiste map.

- **Geen dependencies**: één Node.js-bestand en één HTML-pagina, geen build-stap.
- **Werkt op telefoon én desktop**: swipen met vinger of muis, of met de pijltjestoetsen.
- **Snel en veilig**: verplaatsen binnen dezelfde share is instant, bestanden worden nooit overschreven en nooit buiten de videomap aangeraakt.

## Bediening

| Swipe | Toets | Actie |
|:-----:|:-----:|-------|
| ← links | `←` | Verplaatsen naar `_prullenbak` |
| → rechts | `→` | Behouden (komt niet meer terug) |
| ↑ omhoog | `↑` | Verplaatsen naar `_favorieten` |
| ↓ omlaag | `↓` | Negeren (alleen deze sessie overslaan) |

Video's starten gedempt (vereist door browsers). Tik op de video om het geluid aan of uit te zetten.

## Mappenstructuur

Alles gebeurt binnen één map op je NAS, bijvoorbeeld `/volume1/map1/map2`:

```
map2/
├── ...jouw video's (ook in submappen)...
├── _prullenbak/            ← swipe links, wordt automatisch aangemaakt
├── _favorieten/            ← swipe omhoog, wordt automatisch aangemaakt
└── .vidswap-kept.json   ← swipe rechts: onthoudt wat je behoudt
```

De mappen `_prullenbak` en `_favorieten`, verborgen mappen en Synology's `@eaDir` worden niet meegenomen bij het afspelen. Naamconflicten worden opgelost door een tijdstempel aan de bestandsnaam toe te voegen. De prullenbak wordt **niet** automatisch geleegd, dat doe je zelf wanneer je zeker bent.

Ondersteunde formaten: `mp4`, `m4v`, `webm`, `mov`, `mkv`, `ogv` (afspelen hangt af van wat je browser ondersteunt).

## Installeren op Synology

Je hoeft de repository niet naar de NAS te kopiëren. GitHub bouwt het image automatisch (`.github/workflows/docker.yml`) en zet het op `ghcr.io`; de NAS haalt het zelf op.

**Eenmalig op GitHub**
1. Push deze repository naar [github.com/bigbuud/VidSwap](https://github.com/bigbuud/VidSwap) (branch `main`). De workflow start vanzelf en publiceert `ghcr.io/bigbuud/vidswap:latest`.
2. Is de repository privé? Zet dan het package op publiek (GitHub → je profiel → *Packages* → `vidswap` → *Package settings* → *Change visibility*), of log op de NAS in met `docker login ghcr.io` en een token met `read:packages`.

**Op de NAS**
1. Open **Container Manager** → *Project* → *Aanmaken*, geef het project de naam `vidswap` en kies *docker-compose.yml aanmaken*.
2. Plak de inhoud van [`docker-compose.yml`](docker-compose.yml). Controleer het pad naar je videomap (standaard `/volume1/map1/map2`).
3. Start het project en open `http://<nas-ip>:8085`.

Via SSH kan ook: `sudo docker compose up -d` in de map met je compose-bestand.

**Updaten:** na een push naar `main` is het nieuwe image binnen enkele minuten klaar. Op de NAS: Container Manager → Project → *Actie* → *Opnieuw opbouwen* (of `sudo docker compose pull && sudo docker compose up -d`).

> Liever zonder GitHub Actions? Vervang in de compose de `image:`-regel door `build: https://github.com/bigbuud/VidSwap.git#main`, dan bouwt de NAS het image zelf rechtstreeks uit git.

> De container draait als UID `1026` / GID `100`. Die gebruiker heeft lees- en schrijfrechten nodig op de videomap (Configuratiescherm → Gedeelde map → Bewerken → Machtigingen).

Tip: voeg de pagina toe aan je beginscherm op je telefoon, dan opent VidSwap als een app.

## Instellingen

Rechtstreeks in `docker-compose.yml` aanpassen, of via een `.env`-bestand naast de compose (zie `.env.example`):

| Variabele | Standaard | Omschrijving |
|-----------|-----------|--------------|
| `VIDEO_PATH` | `/volume1/map1/map2` | Map op de NAS met je video's |
| `PUID` / `PGID` | `1026` / `100` | Gebruiker en groep waaronder de container draait |
| `PORT` | `8085` | Poort waarop je de app opent |
| `TRASH_FOLDER` | `_prullenbak` | Map voor weggegooide video's, relatief aan `VIDEO_PATH` |
| `FAV_FOLDER` | `_favorieten` | Map voor favorieten, relatief aan `VIDEO_PATH` |

De server zelf (`server/server.mjs`) leest daarnaast `VIDEO_DIR`, `TRASH_DIR`, `FAV_DIR`, `STATE_FILE` en `PORT` uit de omgeving.

## Lokaal draaien (zonder Docker)

Vereist Node.js 20 of nieuwer.

```sh
cd server
VIDEO_DIR=/pad/naar/testvideos PORT=8080 node server.mjs
# open http://localhost:8080
```

## Projectopbouw

```
.
├── server/
│   ├── server.mjs          # HTTP-server: video's lijst, streamen (Range), acties
│   └── public/             # de app (index.html), logo, icons en manifest
├── docs/banner.png
├── .github/workflows/docker.yml   # bouwt en publiceert het image
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## API

| Route | Omschrijving |
|-------|--------------|
| `GET /api/videos` | Willekeurig geschudde lijst van nog te sorteren video's |
| `POST /api/action` | `{ "file": "pad/naar.mp4", "action": "trash" \| "favorite" \| "keep" }` |
| `GET /video?f=pad/naar.mp4` | Stream met ondersteuning voor spoelen |
| `GET /healthz` | Healthcheck |

> **Let op:** de app heeft geen inlog. Zet hem alleen op je eigen netwerk, of achter een reverse proxy met authenticatie, als je hem buiten je thuisnetwerk wilt gebruiken.
