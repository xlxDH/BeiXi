"""Package clean web output with checksum-verified official Node runtimes."""
import hashlib
import io
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
NODE = '24.11.1'
OUT = ROOT / 'release-assets'
WORK = ROOT / 'release-work'
OUT.mkdir(exist_ok=True)
WORK.mkdir(exist_ok=True)
STAGING = Path(tempfile.mkdtemp(prefix='package-', dir=WORK))
BASE = f'https://nodejs.org/dist/v{NODE}/'
checksums = dict(line.split()[::-1] for line in urllib.request.urlopen(BASE + 'SHASUMS256.txt', timeout=60).read().decode().splitlines())

for target, archive_ext in [('win-x64', 'zip'), ('darwin-x64', 'tar.gz'), ('darwin-arm64', 'tar.gz')]:
    upstream = f'node-v{NODE}-{target}.{archive_ext}'
    cached = WORK / upstream
    if not cached.exists():
        urllib.request.urlretrieve(BASE + upstream, cached)
    if hashlib.sha256(cached.read_bytes()).hexdigest() != checksums[upstream]:
        raise RuntimeError('Node runtime checksum mismatch: ' + upstream)
    label = {'win-x64': 'windows10-11-x64', 'darwin-x64': 'macos-intel', 'darwin-arm64': 'macos-apple-silicon'}[target]
    name = f'BeiXi-v{VERSION}-{label}'
    folder = STAGING / name
    folder.mkdir(exist_ok=True)
    shutil.copytree(ROOT / 'dist-release', folder / 'site')
    shutil.copy2(ROOT / 'scripts/launcher.cjs', folder)
    shutil.copy2(ROOT / 'README.md', folder)
    suffix = 'cmd' if target.startswith('win') else 'command'
    script = folder / f'Start-BeiXi.{suffix}'
    shutil.copy2(ROOT / 'scripts' / script.name, script)
    script.chmod(0o755)
    runtime = folder / 'runtime'
    runtime.mkdir(exist_ok=True)
    binary = 'node.exe' if suffix == 'cmd' else 'bin/node'
    prefix = upstream.removesuffix('.' + archive_ext)
    if archive_ext == 'zip':
        with zipfile.ZipFile(cached) as source:
            for relative in [binary, 'LICENSE']:
                dest = runtime / relative
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(source.read(prefix + '/' + relative))
    else:
        with tarfile.open(cached) as source:
            for relative in [binary, 'LICENSE']:
                dest = runtime / relative
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(source.extractfile(prefix + '/' + relative).read())
                if relative == binary:
                    dest.chmod(0o755)
    (folder / 'START-HERE.txt').write_text(
        'BeiXi v' + VERSION + '\nExtract this package first, then double-click Start-BeiXi.' + suffix +
        '\nNo Node installation is required. Keep the terminal window open.\nOpen Settings to enter your own MapTiler/Tencent browser keys. No private keys are bundled.\n'
        'Windows: x64 Windows 10/11. macOS: 13.5 or later, choose Intel or Apple Silicon.\n'
        'macOS may require right-click > Open for this unsigned launcher; do not disable system security.\n'
        'Maps need Internet access. App data stays in the browser for http://127.0.0.1:41731.\n', encoding='utf-8')
    if suffix == 'cmd':
        shutil.make_archive(str(OUT / name), 'zip', STAGING, name)
    else:
        def permissions(info):
            info.mode = 0o755 if info.isdir() or info.name.endswith(('/Start-BeiXi.command', '/runtime/bin/node')) else 0o644
            return info
        with tarfile.open(OUT / (name + '.tar.gz'), 'w:gz') as output:
            output.add(folder, arcname=name, filter=permissions)
    print('Packaged', name)

# Include dependencies in the unsigned iOS project so its SPM relative paths resolve after extraction.
ios_name = f'BeiXi-v{VERSION}-ios-unsigned-project'
ios_folder = STAGING / ios_name
ios_folder.mkdir(exist_ok=True)
shutil.copytree(ROOT / 'ios', ios_folder / 'ios', dirs_exist_ok=True, ignore=shutil.ignore_patterns('build', 'DerivedData', 'xcuserdata', '.DS_Store'))
for module in ['ios', 'core', 'filesystem', 'share', 'geolocation']:
    shutil.copytree(ROOT / 'node_modules/@capacitor' / module, ios_folder / 'node_modules/@capacitor' / module, dirs_exist_ok=True)
shutil.copy2(ROOT / 'README.md', ios_folder)
(ios_folder / 'UNSIGNED-NOT-INSTALLABLE.txt').write_text('This is an unsigned Xcode project, NOT an IPA. Open ios/App/App.xcodeproj on macOS with Xcode 26+, select your Apple Development Team, then build/sign. Simulator builds do not require distribution signing. See README for limitations.\n', encoding='utf-8')
shutil.make_archive(str(OUT / ios_name), 'zip', STAGING, ios_name)
print('Packaged', ios_name)
