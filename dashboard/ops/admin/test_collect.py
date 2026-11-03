import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('collector',pathlib.Path(__file__).with_name('collect.py'));collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
class CollectorChecks(unittest.TestCase):
 def test_cpu_does_not_count_guest_twice(self):
  self.assertEqual(collector.cpu_sample('cpu 10 20 30 40 5 6 7 8 100 200\ncpu0 1'),(126,45))
 def test_only_public_fingerprint_and_label_returned(self):
  text='256 SHA256:abcDEF0123+/ comment with spaces (ED25519)\nssh-ed25519 AAAAPRIVATELOOKINGRAWKEY must-not-return\n'
  result=collector.key_records(text)
  self.assertEqual(len(result),1);self.assertEqual(result[0]['label'],'comment with spaces');self.assertNotIn('AAAAPRIVATE',str(result))
if __name__=='__main__':unittest.main()
