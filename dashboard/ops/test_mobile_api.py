import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('mobile_api', Path(__file__).with_name('configure-mobile-api.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MobileProxyChecks(unittest.TestCase):
    def test_only_api_bypasses_website_gate(self):
        source = 'server {\n auth_basic "D21 Demo";\n auth_basic_user_file /private/passwords;\n location / {\n  proxy_pass http://127.0.0.1:8088;\n }\n}\n'
        result = module.render(source)
        self.assertIn('location ^~ /app-api/v1/', result)
        self.assertIn('proxy_pass http://127.0.0.1:8088/api/v1/;', result)
        self.assertEqual(result.count('auth_basic off;'), 1)
        self.assertIn('auth_basic "D21 Demo";', result)
        self.assertIn('proxy_set_header Authorization "";', result)
        self.assertEqual(module.render(result), result)
    def test_unexpected_proxy_is_not_overwritten(self):
        with self.assertRaises(ValueError): module.render('server {}')
        with self.assertRaises(ValueError): module.render(module.MARKER + '\nchanged')

if __name__ == '__main__': unittest.main()
