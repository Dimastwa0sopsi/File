"""Совместимость: старые инструкции слались на colab_setup.py.

Теперь всё в одном файле server/colab_cell.py — эта обёртка скачивает его с зеркал
и выполняет, чтобы старые закладки и ссылки продолжали работать.
"""
import urllib.request

GH_REPO = 'Dimastwa0sopsi/File'
GH_BRANCH = 'main'
MIRRORS = [
    'https://cdn.jsdelivr.net/gh/{repo}@{br}/server/colab_cell.py',
    'https://fastly.jsdelivr.net/gh/{repo}@{br}/server/colab_cell.py',
    'https://cdn.statically.io/gh/{repo}/{br}/server/colab_cell.py',
    'https://raw.githack.com/{repo}/{br}/server/colab_cell.py',
]

src = ''
for tpl in MIRRORS:
    url = tpl.format(repo=GH_REPO, br=GH_BRANCH)
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            src = r.read().decode('utf-8')
        if len(src) > 5000:
            print('📥 colab_cell.py:', url.split('/')[2])
            break
        src = ''
    except Exception as e:                      # noqa: BLE001 — пробуем следующее зеркало
        print('   мимо', url.split('/')[2], e)

if not src:
    raise SystemExit('❌ Не удалось скачать server/colab_cell.py — проверьте интернет рантайма '
                     'или вставьте этот файл в ячейку целиком.')

exec(compile(src, 'colab_cell.py', 'exec'), {'__name__': '__main__'})
