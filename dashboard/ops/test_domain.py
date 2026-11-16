import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('domain', Path(__file__).with_name('configure-domain.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DomainProxyChecks(unittest.TestCase):
    def test_punycode(self):
        self.assertEqual(module.DOMAIN, 'xn--kitrifftgebude-gib.de')

    def test_only_landing_and_assets_are_public(self):
        config = module.render()
        self.assertIn('location ^~ /api/ { return 404; }', config)
        self.assertIn('location ^~ /app-api/ { return 404; }', config)
        self.assertIn('proxy_pass http://127.0.0.1:8088/projekt/;', config)
        self.assertIn('location = /datenschutz.html', config)
        self.assertIn('auth_basic off;', config)
        self.assertNotIn('htpasswd', config)
        self.assertNotIn('8088/api', config)
        self.assertNotIn('proxy_pass http://127.0.0.1:8088;', config)
        self.assertIn('server_name xn--kitrifftgebude-gib.de;', config)
        self.assertIn('/etc/letsencrypt/live/xn--kitrifftgebude-gib.de/fullchain.pem', config)

    def test_http_only_serves_acme_and_redirects(self):
        config = module.render(include_tls=False)
        self.assertNotIn('443', config)
        self.assertIn('/.well-known/acme-challenge/', config)
        self.assertIn('return 301 https://xn--kitrifftgebude-gib.de$request_uri;', config)

    def test_www_is_opt_in_for_certificate_coverage(self):
        self.assertNotIn('server_name www.', module.render())
        self.assertIn('server_name www.xn--kitrifftgebude-gib.de;', module.render(include_www=True))

    def test_wrong_dns_prevents_any_activation(self):
        with patch.object(module, 'resolves_here', return_value=False), patch.object(module, 'activate') as activate, patch.object(module.subprocess, 'run') as run, patch('sys.argv', ['configure-domain.py','--apply']):
            with self.assertRaises(SystemExit): module.main()
            activate.assert_not_called()
            run.assert_not_called()

    def test_certificate_failure_restores_prior_config(self):
        import tempfile
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp)/'domain.conf'
            previous = '# D21 managed domain: existing configuration\n'
            config.write_text(previous)
            with patch.object(module,'CONFIG',config), patch.object(module,'CERT_DIR',Path(tmp)/'certificate'), patch.object(module,'WEBROOT',Path(tmp)/'webroot'), patch.object(module,'resolves_here',side_effect=lambda name:name==module.DOMAIN), patch.object(module,'activate'), patch.object(module,'restore') as restore, patch.object(module.subprocess,'run',side_effect=subprocess.CalledProcessError(1,['certbot'])), patch('sys.argv',['configure-domain.py','--apply']):
                with self.assertRaises(subprocess.CalledProcessError): module.main()
                restore.assert_called_once_with(previous)


if __name__ == '__main__': unittest.main()
