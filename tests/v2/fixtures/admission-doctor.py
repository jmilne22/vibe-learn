import contextlib
import io
import json
import unittest
from unittest.mock import patch
import sys
import types
doctor = types.ModuleType("doctor")
exec(compile(sys.stdin.read(), "authored-doctor.py", "exec"), doctor.__dict__)

class DoctorTests(unittest.TestCase):
    def check(self, flags=(), missing=(), absent=False, broken_docker=False, skew=False, unready=False):
        calls=[]
        def run(args):
            calls.append(args)
            if args[:2] == ['docker', 'info']:
                return (1, '', 'permission denied') if broken_docker else (0, '29.8.1', '')
            if args[:3] == ['k3d', 'cluster', 'list']:
                return 0, json.dumps([] if absent else [{'name':'admission-lab'}]), ''
            if args[0]=='kubectl' and '--context' in args:
                if 'version' in args:
                    return 0, json.dumps({'clientVersion':{'gitVersion':'v1.37.1'},
                      'serverVersion':{'gitVersion':'v1.32.5' if skew else 'v1.37.1+k3s1'}}), ''
                return 0, json.dumps({'items':[{'status':{'conditions':[{'type':'Ready','status':'False' if unready else 'True'}]}}]*2}), ''
            return 0, 'version ok', ''
        out=io.StringIO()
        with patch.object(doctor.shutil,'which',side_effect=lambda n: None if n in missing else '/bin/'+n), patch.object(doctor,'run',side_effect=run), contextlib.redirect_stdout(out):
            result=doctor.main(list(flags))
        self.assertFalse(any(any(word in c for word in ['create','apply','delete','use-context']) for c in calls))
        return result,out.getvalue()
    def test_missing_tools_continues(self):
        status,text=self.check(missing=('task','openssl'))
        self.assertEqual(status,1);self.assertIn('nix-shell -p go-task',text);self.assertIn('openssl missing',text);self.assertIn('nodes Ready',text)
    def test_docker_access(self):
        status,text=self.check(broken_docker=True)
        self.assertEqual(status,1);self.assertIn('virtualisation.docker.enable',text)
    def test_absent_is_next(self):
        self.assertEqual(self.check(absent=True)[0],0)
        self.assertEqual(self.check(flags=('--ready',),absent=True)[0],1)
    def test_skew(self):
        status,text=self.check(skew=True);self.assertEqual(status,1);self.assertIn('within one minor',text)
    def test_healthy_and_unready(self):
        self.assertEqual(self.check(flags=('--ready',))[0],0)
        self.assertEqual(self.check(unready=True)[0],1)
    def test_timeout(self):
        with patch.object(doctor.subprocess,'run',side_effect=doctor.subprocess.TimeoutExpired('x',10)):
            self.assertEqual(doctor.run(['x'])[0],1)
if __name__=='__main__':unittest.main()
