import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('domain', Path(__file__).with_name('configure-domain.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DomainProxyChecks(unittest.TestCase):
    def test_punycode(self):
        self.assertEqual(module.DOMAIN, 'xn--kitrifftgebude-gib.de')

    def test_same_routing_as_tunnel(self):
        config = module.render()
        self.assertIn('location ^~ /app-api/v1/', config)
        self.assertIn('proxy_pass http://127.0.0.1:8088/api/v1/;', config)
        self.assertIn('location = /datenschutz.html', config)
        # Only the API and the privacy page bypass the website password.
        self.assertEqual(config.count('auth_basic off;'), 2)
        self.assertIn('auth_basic_user_file /etc/nginx/d21.htpasswd;', config)
        self.assertIn('server_name xn--kitrifftgebude-gib.de;', config)
        self.assertIn('/etc/letsencrypt/live/xn--kitrifftgebude-gib.de/fullchain.pem', config)

    def test_http_only_serves_acme_and_redirects(self):
        config = module.render(include_tls=False)
        self.assertNotIn('443', config)
        self.assertIn('/.well-known/acme-challenge/', config)
        self.assertIn('return 301 https://xn--kitrifftgebude-gib.de$request_uri;', config)


if __name__ == '__main__': unittest.main()
