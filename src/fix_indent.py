import re

def fix_indentation(filename):
    with open(filename, 'r') as f:
        content = f.read()
    
    # Fix the yt-dlp section
    content = re.sub(
        r'    if result\[\'success\'\]:\n            debug_print\("yt-dlp method succeeded"\)\n            return result\n        debug_print',
        r'        if result[\'success\']:\n            debug_print("yt-dlp method succeeded")\n            return result\n        debug_print',
        content
    )
    
    # Fix the requests/BeautifulSoup section
    content = re.sub(
        r'            debug_print\("requests/BeautifulSoup method succeeded"\)\n    return result\n        debug_print',
        r'            debug_print("requests/BeautifulSoup method succeeded")\n            return result\n        debug_print',
        content
    )
    
    with open(filename, 'w') as f:
        f.write(content)

if __name__ == '__main__':
    fix_indentation('transcript_fetcher.py') 