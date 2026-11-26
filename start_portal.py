"""Run the browser-local portal with one stable origin and a dedicated sign-in URL."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

ROOT = Path(__file__).resolve().parent

if __name__ == '__main__':
    address = ('127.0.0.1', 8765)
    url = 'http://127.0.0.1:8765/signin.html'
    try:
        server = ThreadingHTTPServer(address, partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
    except OSError:
        print('Port 8765 is already in use. If the portal is running, open ' + url)
        raise SystemExit(1)
    print('Romford sign-in: ' + url)
    print('Keep this window open. Press Ctrl+C to stop the portal.')
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
