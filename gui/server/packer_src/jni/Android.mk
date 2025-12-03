LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)

LOCAL_MODULE    := packer
LOCAL_SRC_FILES := packer.cpp

include $(BUILD_SHARED_LIBRARY)
