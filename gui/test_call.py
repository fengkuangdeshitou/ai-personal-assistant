import google.generativeai as genai

try:
    genai.configure(api_key="AIzaSyAYsda9YyPhdB2wotagGGVXWxVKHQei4pU")
    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content("Hello")
    print("Success:", response.text)
except Exception as e:
    print("Error:", str(e))