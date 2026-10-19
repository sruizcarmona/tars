import xml.etree.ElementTree as ET
import json
import os
from datetime import datetime

def parse_file(file_path):
    tree = ET.parse(file_path)
    root = tree.getroot()
    
    ns = {'tcx': 'http://www.garmin.com/XMLSchema/TCX/2003',
          'gp': 'http://www.garmin.com/XMLSchema/GPX/2007'}
    
    data_points = []
    
    # Try TCX format
    trackpoints = root.findall('.//tcx:Trackpoint', ns)
    if trackpoints:
        for tp in trackpoints:
            try:
                time_str = tp.find('tcx:Time', ns).text
                time_val = datetime.strptime(time_str, '%Y-%m-%dT%H:%M:%SZ')
                dist_elem = tp.find('tcx:Distance', ns)
                dist = float(dist_elem.text) if dist_elem is not None else 0.0
                alt_elem = tp.find('tcx:Altitude', ns)
                alt = float(alt_elem.text) if alt_elem is not None else 0.0
                hr_elem = tp.find('.//tcx:HeartRateOverall', ns)
                hr = int(hr_elem.text) if hr_elem is not None else None
                
                # Try to find Lat/Lng
                lat_elem = tp.find('.//tcx:LatitudeDegrees', ns)
                lng_elem = tp.find('.//tcx:LongitudeDegrees', ns)
                lat = float(lat_elem.text) if lat_elem is not None else 0.0
                lng = float(lng_elem.text) if lng_elem is not None else 0.0
                
                data_points.append({'time': time_val, 'distance': dist, 'altitude': alt, 'heart_rate': hr, 'lat': lat, 'lng': lng})
            except: continue
    else:
        # Try the specific Garmin XML format
        for tp in root.findall('.//Trackpoint'):
            try:
                time_str = tp.find('Time').text
                time_val = datetime.strptime(time_str, '%Y-%m-%dT%H:%M:%S.%fZ') if '.' in time_str else datetime.strptime(time_str, '%Y-%m-%dT%H:%M:%SZ')
                dist = float(tp.find('DistanceMeters').text)
                alt = float(tp.find('AltitudeMeters').text)
                hr_elem = tp.find('HeartRateBpm/Value')
                hr = int(hr_elem.text) if hr_elem is not None else None
                
                # Look for lat/lng in this format
                lat_elem = tp.find('LatitudeDegrees')
                lng_elem = tp.find('LongitudeDegrees')
                lat = float(lat_elem.text) if lat_elem is not None else 0.0
                lng = float(lng_elem.text) if lng_elem is not None else 0.0
                
                data_points.append({'time': time_val, 'distance': dist, 'altitude': alt, 'heart_rate': hr, 'lat': lat, 'lng': lng})
            except: continue
            
    return data_points

def calculate_pace(data):
    # Pace in min/km
    processed = []
    for i in range(len(data)):
        p = data[i]
        if i == 0:
            pace = None
        else:
            p_prev = data[i-1]
            dist_diff = p['distance'] - p_prev['distance']
            time_diff = (p['time'] - p_prev['time']).total_seconds()
            if dist_diff > 0:
                pace = (time_diff / 60) / (dist_diff / 1000)
            else:
                pace = None
        
        processed.append({
            'timestamp': p['time'].isoformat(),
            'lat': p['lat'],
            'lng': p['lng'],
            'alt': p['altitude'],
            'hr': p['heart_rate'],
            'pace': pace,
            'distance': p['distance']
        })
    return processed

def main():
    files = {
        '2025': 'data/polar_2025-10-19_comparison.xml',
        '2026': 'data/polar_2026-10-18_08-31-12_RUNNING.tcx'
    }
    
    output_dir = 'data/ghosts'
    os.makedirs(output_dir, exist_ok=True)
    
    for year, path in files.items():
        full_path = os.path.join(os.getcwd(), path)
        if os.path.exists(full_path):
            print(f"Exporting {year} ghost...")
            raw_data = parse_file(full_path)
            clean_data = calculate_pace(raw_data)
            
            output_file = os.path.join(output_dir, f'ghost_{year}.json')
            with open(output_file, 'w') as f:
                json.dump(clean_data, f, indent=4)
            print(f"Saved to {output_file}")

if __name__ == '__main__':
    main()
