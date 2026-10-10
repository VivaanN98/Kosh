// Builds the signed Android APK: web build (--mode native) → cap sync → Gradle assembleRelease.
// Toolchain lives outside the repo (no spaces in path; C: is nearly full): KOSH_ANDROID_HOME
// (default D:\KoshAndroid) holds jdk-21, android-sdk, gradle-home and the release keystore.
// Output: dist-apk/Kosh-<version>.apk
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const home = process.env.KOSH_ANDROID_HOME ?? 'D:/KoshAndroid';
const env = {
  ...process.env,
  JAVA_HOME: join(home, 'jdk-21'),
  ANDROID_HOME: join(home, 'android-sdk'),
  ANDROID_SDK_ROOT: join(home, 'android-sdk'),
  GRADLE_USER_HOME: join(home, 'gradle-home'),
  PATH: `${join(home, 'jdk-21', 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
};
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', env, ...opts });

for (const dir of ['jdk-21', 'android-sdk']) {
  if (!existsSync(join(home, dir))) {
    console.error(`Missing ${join(home, dir)} — see docs/deployment.md#android-app for the one-time toolchain setup.`);
    process.exit(1);
  }
}

// One-time release keystore (kept outside the repo).
const keystore = join(home, 'kosh-release.jks');
const props = 'android/keystore.properties';
if (!existsSync(keystore)) {
  const pass = randomBytes(18).toString('base64url');
  run(`"${join(home, 'jdk-21', 'bin', 'keytool')}" -genkeypair -v -keystore "${keystore}" -alias kosh -keyalg RSA -keysize 4096 -validity 10000 -storepass ${pass} -keypass ${pass} -dname "CN=Kosh, O=Personal, C=IN"`, { stdio: 'ignore' });
  writeFileSync(join(home, 'keystore-password.txt'), `${pass}\n`);
  console.log(`Created release keystore ${keystore} — BACK UP this file and keystore-password.txt.`);
}
if (!existsSync(props)) {
  const pass = readFileSync(join(home, 'keystore-password.txt'), 'utf8').trim();
  writeFileSync(props, `storeFile=${keystore.split('\\').join('/')}\nstorePassword=${pass}\nkeyAlias=kosh\nkeyPassword=${pass}\n`);
}
// local.properties uses Java properties escaping: forward slashes avoid backslash escapes entirely.
writeFileSync('android/local.properties', `sdk.dir=${join(home, 'android-sdk').split('\\').join('/')}\n`);

// Android installs an update only if versionCode increases: use the commit count (monotonic).
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const versionCode = Number(execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim()) || 1;
const gradleFile = 'android/app/build.gradle';
writeFileSync(
  gradleFile,
  readFileSync(gradleFile, 'utf8')
    .replace(/versionCode \d+/, `versionCode ${versionCode}`)
    .replace(/versionName "[^"]*"/, `versionName "${version}"`),
);
console.log(`Building Kosh ${version} (versionCode ${versionCode})`);
run('npx vite build --mode native');
run('npx cap sync android');
run(process.platform === 'win32' ? '.\\gradlew.bat assembleRelease --no-daemon' : './gradlew assembleRelease --no-daemon', { cwd: 'android' });

mkdirSync('dist-apk', { recursive: true });
const out = join('dist-apk', `Kosh-${version}.apk`);
copyFileSync('android/app/build/outputs/apk/release/app-release.apk', out);
console.log(`\nAPK ready: ${out}`);
