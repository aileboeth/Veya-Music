import java.util.Properties

plugins {
    id("com.android.application")
}

// 版本号和电脑版一致：读仓库根目录的 package.json
@Suppress("UNCHECKED_CAST")
val pkg = groovy.json.JsonSlurper().parse(rootProject.file("../package.json")) as Map<String, Any>
val appVersion = pkg["version"] as String
val appVersionCode = appVersion.split(".").map { it.toInt() }.let { (a, b, c) -> a * 10000 + b * 100 + c }

// 发布签名放在仓库外面（D:\Claude\music\keys）；没有时 release 用 debug 签名
val keyProps = Properties().apply {
    val f = rootProject.file("../../keys/android-keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.aileboeth.veyamusic"
    compileSdk = 37
    buildToolsVersion = "36.1.0"

    defaultConfig {
        applicationId = "com.aileboeth.veyamusic"
        minSdk = 29
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersion
    }

    signingConfigs {
        create("release") {
            if (keyProps.isNotEmpty()) {
                storeFile = rootProject.file("../../keys/" + keyProps.getProperty("storeFile"))
                storePassword = keyProps.getProperty("storePassword")
                keyAlias = keyProps.getProperty("keyAlias")
                keyPassword = keyProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (keyProps.isNotEmpty()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    val media3 = "1.8.0"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-session:$media3")
    implementation("androidx.media3:media3-datasource-okhttp:$media3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
