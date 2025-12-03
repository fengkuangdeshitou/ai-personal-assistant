#include <jni.h>
#include <string>

// Key for decryption (0xAA)
const jbyte KEY = (jbyte)0xAA;

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_wrapper_ProxyApplication_decrypt(JNIEnv *env, jobject thiz, jbyteArray encryptedData) {
    if (encryptedData == NULL) {
        return NULL;
    }

    jsize len = env->GetArrayLength(encryptedData);
    jbyte* buffer = env->GetByteArrayElements(encryptedData, NULL);

    if (buffer == NULL) {
        return NULL;
    }

    // XOR Decryption
    for (int i = 0; i < len; i++) {
        buffer[i] = buffer[i] ^ KEY;
    }

    // Commit changes back to the java array
    env->ReleaseByteArrayElements(encryptedData, buffer, 0);
    
    return encryptedData;
}
