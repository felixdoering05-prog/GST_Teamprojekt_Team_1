import io
import subprocess
import unittest
from unittest.mock import patch

from firmware_upload import upload_firmware


class FirmwareUploadTests(unittest.TestCase):
    def run_upload(self):
        with patch('firmware_upload.Path.is_file', return_value=True):
            upload_firmware('/private/build', '/dev/test-esp32', '/tools/esptool',
                            '/tools/boot_app0.bin', io.StringIO())

    @patch('firmware_upload.Path.is_file', return_value=False)
    @patch('firmware_upload.subprocess.run')
    def test_missing_images_never_touch_board(self, run, is_file):
        with self.assertRaisesRegex(RuntimeError, 'Dateien fehlen'):
            upload_firmware('/missing', '/dev/test', '/esptool', '/boot.bin', io.StringIO())
        run.assert_not_called()

    @patch('firmware_upload.time.sleep')
    @patch('firmware_upload.subprocess.run')
    def test_reconnects_after_usb_reset_disconnect_and_verifies(self, run, sleep):
        run.side_effect = [subprocess.CompletedProcess([], code) for code in (2, 2, 0, 0)]
        self.run_upload()
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual([c[c.index('--before') + 1] for c in commands],
                         ['no-reset', 'default-reset', 'no-reset', 'no-reset'])
        self.assertIn('verify-flash', commands[-1])
        self.assertEqual(commands[-1][-2:], ['0x10000', '/private/build/esp32-simulation.ino.bin'])
        self.assertIn('hard-reset', commands[-1])

    @patch('firmware_upload.subprocess.run')
    def test_failed_readback_is_not_successful_installation(self, run):
        run.side_effect = [subprocess.CompletedProcess([], code) for code in (0, 2)]
        with self.assertRaisesRegex(RuntimeError, 'nicht bestaetigt'):
            self.run_upload()

    @patch('firmware_upload.time.sleep')
    @patch('firmware_upload.subprocess.run')
    def test_all_upload_attempts_fail_without_verification(self, run, sleep):
        run.return_value = subprocess.CompletedProcess([], 2)
        with self.assertRaisesRegex(RuntimeError, 'Upload fehlgeschlagen'):
            self.run_upload()
        self.assertEqual(run.call_count, 3)
        self.assertTrue(all('verify-flash' not in c.args[0] for c in run.call_args_list))


if __name__ == '__main__':
    unittest.main()
