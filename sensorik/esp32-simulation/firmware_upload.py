"""Flash and verify the ESP32-S3 without relying on USB auto-reset alone."""
import subprocess
import time
from pathlib import Path


def upload_firmware(build, port, esptool, boot_app0, log):
    build = Path(build)
    images = [
        ('0x0', build / 'esp32-simulation.ino.bootloader.bin'),
        ('0x8000', build / 'esp32-simulation.ino.partitions.bin'),
        ('0xe000', Path(boot_app0)),
        ('0x10000', build / 'esp32-simulation.ino.bin'),
    ]
    if any(not image.is_file() for _, image in images):
        raise RuntimeError('Firmware-Dateien fehlen. Es wurde nichts aufgespielt.')
    base = [esptool, '--chip', 'esp32s3', '--port', port, '--baud', '115200']

    def run(arguments):
        return subprocess.run(base + arguments, stdout=log, stderr=log).returncode == 0

    # A macOS USB reset can disconnect the port after putting the chip into
    # download mode. Reconnect without another reset on the next attempt.
    for before in ('no-reset', 'default-reset', 'no-reset'):
        if run(['--before', before, '--after', 'no-reset', 'write-flash', '-z',
                '--flash-mode', 'keep', '--flash-freq', 'keep', '--flash-size', 'keep']
               + [str(value) for pair in images for value in pair]):
            break
        time.sleep(2)
    else:
        raise RuntimeError('Upload fehlgeschlagen. BOOT gedrueckt halten, RESET kurz druecken, BOOT loslassen und erneut versuchen.')

    # Do not report success from the uploader's exit code alone. Check the
    # complete application on the board against the binary just built.
    if not run(['--before', 'no-reset', '--after', 'hard-reset', 'verify-flash',
                '0x10000', str(images[-1][1])]):
        raise RuntimeError('Firmware konnte auf dem ESP32 nicht bestaetigt werden. Noch keine erfolgreiche Installation.')
