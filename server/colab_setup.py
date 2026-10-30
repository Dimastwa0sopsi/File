# Ячейка для Google Colab: база на Google Диске + сервер + туннель ngrok.
# 1) Запустите ячейку, 2) вставьте свой ngrok-токен, 3) адрес wss://... вставьте в меню игры.
# 4) Следующей ячейкой запустите colab_admin.py — это админ-панель с кнопками.
from google.colab import drive
import os, subprocess, time

drive.mount('/content/drive')
GAME_DIR = '/content/drive/MyDrive/MyGame'
os.makedirs(GAME_DIR, exist_ok=True)
os.chdir(GAME_DIR)

# сервер кладём рядом с базой, если его там ещё нет
if not os.path.exists('server.js'):
    # загрузите server/server.js из репозитория в MyGame, либо вставьте его содержимое сюда
    raise SystemExit('Положите server.js в MyGame (файл из папки server репозитория)')

subprocess.run('npm init -y > /dev/null 2>&1', shell=True)
subprocess.run('npm install ws better-sqlite3 > /dev/null 2>&1', shell=True)
subprocess.run('pip install pyngrok -q', shell=True)

# токен админ-панели: придумайте свой или оставьте этот
ADMIN_TOKEN = 'losgorod-admin'
os.environ['ADMIN_TOKEN'] = ADMIN_TOKEN
os.environ['ADMIN_API'] = 'http://127.0.0.1:3000'

env = dict(os.environ, DB_FILE=os.path.join(GAME_DIR, 'game.db'), PORT='3000', ADMIN_TOKEN=ADMIN_TOKEN)
proc = subprocess.Popen(['node', 'server.js'], cwd=GAME_DIR, env=env)
time.sleep(2)

from pyngrok import ngrok, conf
conf.get_default().auth_token = 'ВСТАВЬТЕ_ТОКЕН_NGROK'
url = ngrok.connect(3000, 'http').public_url
print('Адрес для игры:', url.replace('https', 'wss'))
print('База:', os.path.join(GAME_DIR, 'game.db'))
print('Токен админ-панели:', ADMIN_TOKEN, '(панель: следующая ячейка)')
