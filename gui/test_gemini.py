import google.generativeai as genai

genai.configure(api_key="AIzaSyAYsda9YyPhdB2wotagGGVXWxVKHQei4pU")

for m in genai.list_models():
    print(m.name)