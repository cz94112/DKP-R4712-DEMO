"""Cross-language integration; disposable DB, ephemeral loopback port, no cloud."""
import os, socket, subprocess, tempfile, threading, time, unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
import sys
source=os.environ.get("DKP_R479_WINDOWS_SOURCE")
if not source:raise RuntimeError("Set DKP_R479_WINDOWS_SOURCE to extracted R479 Windows source directory")
sys.path.insert(0,str(Path(source).resolve()))
import uvicorn
from app.server import create_app
from app.storage import init_db, set_admin, store_state, get_state, conn_for
from seed_sample import vehicle

class Integration(unittest.TestCase):
    def test_lost_reply(self):self.run_scenario("lost")
    def test_isolated_conflict(self):self.run_scenario("conflict")
    def run_scenario(self,scenario):
        script=Path(__file__).resolve().parent/'integration-r4711g.mjs'
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ,{'DKP_TEST_MODE':'1','DKP_PUSH_LIVE':'0','DKP_WEBPUSH_LIVE':'0','DKP_PUBLIC_ORIGIN':''}):
            folder=Path(tmp)/'test_data_4b15';db=init_db(folder)
            set_admin(db,'quanly','test-only-password')
            state=get_state(db);state['vehicles']=[vehicle(f'DEMO-{n:03}','DEMO vehicle','DEMO',7,1000,[]) for n in range(1,4)];store_state(db,state,state['revision'])
            rev=get_state(db)['revision']
            with closing(socket.socket()) as sock:
                sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
                server=uvicorn.Server(uvicorn.Config(create_app(folder),log_level='error',access_log=False))
                thread=threading.Thread(target=server.run,kwargs={'sockets':[sock]},daemon=True);thread.start()
                try:
                    deadline=time.monotonic()+8
                    while not server.started and time.monotonic()<deadline:time.sleep(.025)
                    self.assertTrue(server.started)
                    p=subprocess.run(['node',str(script),f'http://127.0.0.1:{port}',scenario],capture_output=True,text=True,encoding='utf-8',timeout=30)
                    self.assertEqual(p.returncode,0,p.stdout+p.stderr)
                    print(p.stdout.strip())
                    self.assertEqual(get_state(db)['revision'],rev+3)
                    with closing(conn_for(db)) as con:self.assertEqual(con.execute('SELECT COUNT(*) FROM native_sync_receipts').fetchone()[0],3)
                finally:
                    server.should_exit=True;thread.join(8)
                self.assertFalse(thread.is_alive())
if __name__=='__main__':unittest.main(verbosity=2)
