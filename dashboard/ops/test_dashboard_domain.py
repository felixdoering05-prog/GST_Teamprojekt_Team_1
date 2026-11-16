import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('dashboard_domain', Path(__file__).with_name('configure-dashboard-domain.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DashboardDomainChecks(unittest.TestCase):
    def test_existing_protected_gateway_handles_all_dashboard_paths(self):
        config = module.render()
        self.assertIn('server_name titanfs.de;', config)
        self.assertIn('proxy_pass http://127.0.0.1:8089;', config)
        self.assertNotIn('proxy_pass http://127.0.0.1:8088', config)
        self.assertNotIn('auth_basic off;', config)
        self.assertNotIn('proxy_set_header Authorization', config)
        self.assertNotIn('/projekt/', config)
        self.assertNotIn('kitrifftgeb', config)
        self.assertIn('client_max_body_size 26m;', config)
        self.assertIn('proxy_read_timeout 125s;', config)

    def test_https_certificate_and_canonical_www(self):
        config = module.render(include_www=True)
        self.assertIn('server_name www.titanfs.de;', config)
        self.assertIn('/etc/letsencrypt/live/titanfs.de/fullchain.pem', config)
        self.assertIn('return 301 https://titanfs.de$request_uri;', config)
        self.assertNotIn('server_name www.', module.render())

    def test_bootstrap_serves_only_acme_and_redirect(self):
        config = module.render(False)
        self.assertIn('/.well-known/acme-challenge/', config)
        self.assertNotIn('443', config)
        self.assertNotIn('proxy_pass', config)

    def test_dns_must_not_contain_other_ipv4_or_ipv6(self):
        with patch.object(module.socket, 'getaddrinfo', return_value=[(None,None,None,None,('185.56.151.249',443)),(None,None,None,None,('::1',443))]):
            self.assertFalse(module.resolves_here(module.DOMAIN))
        with patch.object(module.socket, 'getaddrinfo', return_value=[(None,None,None,None,('185.56.151.249',443))]):
            self.assertTrue(module.resolves_here(module.DOMAIN))

    def test_wrong_dns_prevents_all_changes(self):
        with patch.object(module, 'resolves_here', return_value=False), patch.object(module,'activate') as activate, patch.object(module.subprocess,'run') as run, patch('sys.argv',['configure-dashboard-domain.py','--apply']):
            with self.assertRaises(SystemExit): module.main()
            activate.assert_not_called()
            run.assert_not_called()

    def test_certificate_failure_restores_previous_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            config=Path(tmp)/'titanfs.conf'
            previous=module.MARKER+'\n# existing\n'
            config.write_text(previous)
            with patch.object(module,'CONFIG',config), patch.object(module,'CERT_DIR',Path(tmp)/'certificate'), patch.object(module,'WEBROOT',Path(tmp)/'webroot'), patch.object(module,'resolves_here',side_effect=lambda name:name==module.DOMAIN), patch.object(module.socket,'create_connection',return_value=MagicMock()), patch.object(module,'activate'), patch.object(module,'restore') as restore, patch.object(module.subprocess,'run',side_effect=subprocess.CalledProcessError(1,['certbot'])), patch('sys.argv',['configure-dashboard-domain.py','--apply']):
                with self.assertRaises(subprocess.CalledProcessError): module.main()
                restore.assert_called_once_with(previous)


if __name__ == '__main__': unittest.main()
