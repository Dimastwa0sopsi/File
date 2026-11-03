# ======================================================================
#  «Лос-Город» — Colab, ячейка-загрузчик (короткая, ничего не обрежется).
#  Копируйте целиком, запускайте. Она сама скачает актуальный
#  server/colab_cell.py из репозитория и выполнит его.
#  Ветку можно поменять в BRANCHES ниже.
# ======================================================================
import base64
import json
import urllib.request

REPO = 'Dimastwa0sopsi/File'
PATH = 'server/colab_cell.py'
BRANCHES = ['arena/bbf0a881-file', 'main']      # первый доступный побеждает
API = 'https://api.github.com/repos/{repo}/contents/{path}?ref={ref}'
MIRRORS = [
    'https://cdn.jsdelivr.net/gh/{repo}@{ref}/{path}',
    'https://fastly.jsdelivr.net/gh/{repo}@{ref}/{path}',
    'https://cdn.statically.io/gh/{repo}/{ref}/{path}',
]
LOCAL = '/content/colab_cell.py'


def fetch():
    """GitHub API → jsDelivr → fastly → Statically (raw.githubusercontent не используем)"""
    for ref in BRANCHES:
        try:
            req = urllib.request.Request(API.format(repo=REPO, path=PATH, ref=ref),
                                         headers={'User-Agent': 'losgorod-colab'})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = base64.b64decode(json.loads(r.read().decode())['content']).decode('utf-8')
            if len(data) > 20000:
                return data, f'api.github.com @ {ref}'
        except Exception as e:                             # noqa: BLE001
            print(f'   мимо api @ {ref}: {e}')
    for ref in BRANCHES:
        for tpl in MIRRORS:
            url = tpl.format(repo=REPO, ref=ref, path=PATH)
            try:
                with urllib.request.urlopen(url, timeout=30) as r:
                    data = r.read().decode('utf-8')
                if len(data) > 20000:
                    return data, f'{url.split("/")[2]} @ {ref}'
            except Exception as e:                         # noqa: BLE001
                print(f'   мимо {url.split("/")[2]} @ {ref}: {e}')
    raise SystemExit('❌ Не удалось скачать colab_cell.py — проверьте интернет и ветку в BRANCHES')


src, where = fetch()
open(LOCAL, 'w', encoding='utf-8').write(src)
print(f'⬇️ colab_cell.py: {len(src) // 1024} КБ с {where} → {LOCAL}', flush=True)
exec(compile(src, LOCAL, 'exec'), {'__name__': '__main__', '__file__': LOCAL})
