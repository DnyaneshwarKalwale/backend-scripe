#!/usr/bin/env python3
import sys
import subprocess
import pkg_resources
import json
import os

def check_dependency(package_name):
    """Check if a package is installed and return its version if found."""
    try:
        package = pkg_resources.get_distribution(package_name)
        return {
            "installed": True,
            "version": package.version
        }
    except pkg_resources.DistributionNotFound:
        return {
            "installed": False,
            "version": None
        }

def install_package(package_name, version=None):
    """Install a package using pip."""
    try:
        if version:
            package_spec = f"{package_name}=={version}"
        else:
            package_spec = package_name
            
        subprocess.check_call([sys.executable, "-m", "pip", "install", package_spec])
        return True
    except subprocess.CalledProcessError:
        return False

def main():
    # Get Python environment info
    python_info = {
        "python_version": sys.version,
        "python_executable": sys.executable,
        "pip_location": subprocess.getoutput([sys.executable, "-m", "pip", "--version"])
    }
    
    # Check for youtube-transcript-api
    yt_api_status = check_dependency("youtube-transcript-api")
    
    # Try to install it if not found
    if not yt_api_status["installed"]:
        print("youtube-transcript-api not found. Attempting to install...")
        install_success = install_package("youtube-transcript-api", "1.0.3")
        if install_success:
            print("Installation successful!")
            yt_api_status = check_dependency("youtube-transcript-api")
        else:
            print("Installation failed!")
    
    # Output results
    result = {
        "python_info": python_info,
        "youtube_transcript_api": yt_api_status,
        "current_working_directory": os.getcwd(),
        "environment_variables": dict(os.environ)
    }
    
    print(json.dumps(result, indent=2))
    
    # Create a test file
    try:
        with open("dependency_check_result.json", "w") as f:
            json.dump(result, f, indent=2)
        print(f"Results saved to {os.path.join(os.getcwd(), 'dependency_check_result.json')}")
    except Exception as e:
        print(f"Error saving results: {str(e)}")
    
    # Try to import and use the module
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        print("\nTesting transcript retrieval...")
        
        video_id = "jNQXAC9IVRw"  # First YouTube video
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        
        if transcript:
            print("Successfully retrieved transcript!")
            print(f"First few words: {' '.join([item['text'] for item in transcript[:3]])}")
        else:
            print("Failed to retrieve transcript!")
    except Exception as e:
        print(f"Error testing transcript retrieval: {str(e)}")

if __name__ == "__main__":
    main() 