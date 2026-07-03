import os
import re

def to_kebab_case(filename):
    # Remove extension
    name, ext = os.path.splitext(filename)
    # Convert to lowercase
    name = name.lower()
    # Replace spaces and other non-alphanumeric characters (except hyphens) with hyphens
    name = re.sub(r'[\s_]+', '-', name)
    # Remove any characters that are not alphanumeric or hyphens (optional, but good for strict kebab-case)
    # keeping . and - as valid.
    # Actually, simply replacing spaces with hyphens and lowercasing is usually what is meant, 
    # but let's handle the "Screen Recording..." case cleanly.
    # The previous regex replaces whitespace and underscores with hyphens.
    return f"{name}{ext}"

def cleanup_hours_of_service():
    target_dir = os.path.join('src', 'assets', 'images', 'projects', 'hours-of-service')
    
    if not os.path.exists(target_dir):
        print(f"Directory not found: {target_dir}")
        return

    print(f"Cleaning up directory: {target_dir}")

    for filename in os.listdir(target_dir):
        file_path = os.path.join(target_dir, filename)
        
        if not os.path.isfile(file_path):
            continue

        # Delete .png files
        if filename.lower().endswith('.png'):
            try:
                os.remove(file_path)
                print(f"Deleted: {filename}")
            except OSError as e:
                print(f"Error deleting {filename}: {e}")
            continue

        # Rename .webp files to kebab-case
        if filename.lower().endswith('.webp'):
            new_filename = to_kebab_case(filename)
            
            if new_filename != filename:
                new_file_path = os.path.join(target_dir, new_filename)
                try:
                    os.rename(file_path, new_file_path)
                    print(f"Renamed: '{filename}' -> '{new_filename}'")
                except OSError as e:
                    print(f"Error renaming {filename}: {e}")

if __name__ == "__main__":
    cleanup_hours_of_service()
