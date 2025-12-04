from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
import json
from functools import wraps
import random

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-this'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///smart_energy_vehicle.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
CORS(app)

# ===== CORS & STATIC FILES CONFIGURATION =====

CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# ===== DATABASE MODELS =====

class User(UserMixin, db.Model):
    """User model for authentication"""
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(120))
    phone = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    vehicles = db.relationship('Vehicle', backref='owner', lazy=True, cascade='all, delete-orphan')
    energy_logs = db.relationship('EnergyLog', backref='user', lazy=True, cascade='all, delete-orphan')
    emergency_contacts = db.relationship('EmergencyContact', backref='user', lazy=True, cascade='all, delete-orphan')
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'full_name': self.full_name,
            'phone': self.phone,
            'created_at': self.created_at.isoformat()
        }

class Vehicle(db.Model):
    """Vehicle model for storing vehicle information"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    vehicle_name = db.Column(db.String(120), nullable=False)
    vehicle_type = db.Column(db.String(50), nullable=False)  # Petrol, EV, Hybrid, CNC
    make = db.Column(db.String(100))
    model = db.Column(db.String(100))
    year = db.Column(db.Integer)
    fuel_capacity = db.Column(db.Float)  # in liters
    battery_capacity = db.Column(db.Float)  # in kWh for EV
    current_fuel = db.Column(db.Float, default=0)
    current_battery = db.Column(db.Float, default=0)
    mileage = db.Column(db.Float, default=0)  # in km
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    energy_logs = db.relationship('EnergyLog', backref='vehicle', lazy=True, cascade='all, delete-orphan')
    routes = db.relationship('Route', backref='vehicle', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'vehicle_name': self.vehicle_name,
            'vehicle_type': self.vehicle_type,
            'make': self.make,
            'model': self.model,
            'year': self.year,
            'fuel_capacity': self.fuel_capacity,
            'battery_capacity': self.battery_capacity,
            'current_fuel': self.current_fuel,
            'current_battery': self.current_battery,
            'mileage': self.mileage,
            'created_at': self.created_at.isoformat()
        }

class EnergyLog(db.Model):
    """Energy consumption tracking"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    vehicle_id = db.Column(db.Integer, db.ForeignKey('vehicle.id'), nullable=False)
    energy_consumed = db.Column(db.Float, nullable=False)  # in liters or kWh
    distance_traveled = db.Column(db.Float, nullable=False)  # in km
    cost = db.Column(db.Float, nullable=False)
    efficiency = db.Column(db.Float)  # km/liter or km/kWh
    co2_emissions = db.Column(db.Float)  # in kg
    date = db.Column(db.DateTime, default=datetime.utcnow)
    notes = db.Column(db.Text)
    
    def to_dict(self):
        return {
            'id': self.id,
            'energy_consumed': self.energy_consumed,
            'distance_traveled': self.distance_traveled,
            'cost': self.cost,
            'efficiency': self.efficiency,
            'co2_emissions': self.co2_emissions,
            'date': self.date.isoformat(),
            'notes': self.notes
        }

class Route(db.Model):
    """Route optimization and history"""
    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey('vehicle.id'), nullable=False)
    start_location = db.Column(db.String(255), nullable=False)
    end_location = db.Column(db.String(255), nullable=False)
    distance = db.Column(db.Float, nullable=False)
    estimated_energy = db.Column(db.Float)
    actual_energy = db.Column(db.Float)
    route_type = db.Column(db.String(50))  # shortest, efficient, traffic-aware
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    completed = db.Column(db.Boolean, default=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'start_location': self.start_location,
            'end_location': self.end_location,
            'distance': self.distance,
            'estimated_energy': self.estimated_energy,
            'actual_energy': self.actual_energy,
            'route_type': self.route_type,
            'timestamp': self.timestamp.isoformat(),
            'completed': self.completed
        }

class Station(db.Model):
    """Fuel/Charging stations"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    station_type = db.Column(db.String(50), nullable=False)  # Petrol, EV_Charging, Hybrid, CNC
    address = db.Column(db.String(255))
    phone = db.Column(db.String(20))
    rating = db.Column(db.Float, default=0)
    open_24_7 = db.Column(db.Boolean, default=False)
    price_per_unit = db.Column(db.Float)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'station_type': self.station_type,
            'address': self.address,
            'phone': self.phone,
            'rating': self.rating,
            'open_24_7': self.open_24_7,
            'price_per_unit': self.price_per_unit
        }

class EmergencyContact(db.Model):
    """Emergency contacts for SOS"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    contact_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    relationship = db.Column(db.String(50))
    is_primary = db.Column(db.Boolean, default=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'contact_name': self.contact_name,
            'phone': self.phone,
            'relationship': self.relationship,
            'is_primary': self.is_primary
        }

class EmergencyAlert(db.Model):
    """Emergency alerts and incidents"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    vehicle_id = db.Column(db.Integer, db.ForeignKey('vehicle.id'))
    alert_type = db.Column(db.String(50), nullable=False)  # accident, mechanical, fuel_empty
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    description = db.Column(db.Text)
    status = db.Column(db.String(50), default='active')  # active, resolved
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'alert_type': self.alert_type,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'description': self.description,
            'status': self.status,
            'timestamp': self.timestamp.isoformat()
        }

# ===== LOGIN MANAGER =====

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ===== AUTHENTICATION ROUTES =====

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        data = request.get_json()
        
        if not data or not data.get('username') or not data.get('email') or not data.get('password'):
            return jsonify({'error': 'Missing required fields'}), 400
        
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'error': 'Username already exists'}), 400
        
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': 'Email already exists'}), 400
        
        user = User(
            username=data['username'],
            email=data['email'],
            full_name=data.get('full_name', ''),
            phone=data.get('phone', '')
        )
        user.set_password(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        login_user(user)
        return jsonify({
            'message': 'Registration successful',
            'user': user.to_dict()
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login user"""
    try:
        data = request.get_json()
        
        if not data or not data.get('username') or not data.get('password'):
            return jsonify({'error': 'Missing username or password'}), 400
        
        user = User.query.filter_by(username=data['username']).first()
        
        if not user or not user.check_password(data['password']):
            return jsonify({'error': 'Invalid username or password'}), 401
        
        login_user(user)
        return jsonify({
            'message': 'Login successful',
            'user': user.to_dict()
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    """Logout user"""
    logout_user()
    return jsonify({'message': 'Logged out successfully'}), 200

@app.route('/api/auth/profile', methods=['GET'])
@login_required
def get_profile():
    """Get current user profile"""
    return jsonify(current_user.to_dict()), 200

# ===== VEHICLE ROUTES =====

@app.route('/api/vehicles', methods=['GET', 'POST'])
@login_required
def vehicles():
    """Get all vehicles or create a new vehicle"""
    if request.method == 'GET':
        vehicles = Vehicle.query.filter_by(user_id=current_user.id).all()
        return jsonify([v.to_dict() for v in vehicles]), 200
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            vehicle = Vehicle(
                user_id=current_user.id,
                vehicle_name=data['vehicle_name'],
                vehicle_type=data['vehicle_type'],
                make=data.get('make'),
                model=data.get('model'),
                year=data.get('year'),
                fuel_capacity=data.get('fuel_capacity'),
                battery_capacity=data.get('battery_capacity'),
                current_fuel=data.get('current_fuel', 0),
                current_battery=data.get('current_battery', 0)
            )
            db.session.add(vehicle)
            db.session.commit()
            return jsonify(vehicle.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

@app.route('/api/vehicles/<int:vehicle_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def vehicle_detail(vehicle_id):
    """Get, update, or delete a specific vehicle"""
    vehicle = Vehicle.query.get_or_404(vehicle_id)
    
    if vehicle.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    if request.method == 'GET':
        return jsonify(vehicle.to_dict()), 200
    
    elif request.method == 'PUT':
        try:
            data = request.get_json()
            for key, value in data.items():
                if hasattr(vehicle, key):
                    setattr(vehicle, key, value)
            db.session.commit()
            return jsonify(vehicle.to_dict()), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500
    
    elif request.method == 'DELETE':
        try:
            db.session.delete(vehicle)
            db.session.commit()
            return jsonify({'message': 'Vehicle deleted'}), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

# ===== ENERGY TRACKING ROUTES =====

@app.route('/api/energy-logs', methods=['GET', 'POST'])
@login_required
def energy_logs():
    """Get all energy logs or create a new one"""
    if request.method == 'GET':
        vehicle_id = request.args.get('vehicle_id')
        days = request.args.get('days', 30, type=int)
        
        query = EnergyLog.query.filter_by(user_id=current_user.id)
        if vehicle_id:
            query = query.filter_by(vehicle_id=vehicle_id)
        
        since = datetime.utcnow() - timedelta(days=days)
        logs = query.filter(EnergyLog.date >= since).all()
        
        return jsonify([log.to_dict() for log in logs]), 200
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            log = EnergyLog(
                user_id=current_user.id,
                vehicle_id=data['vehicle_id'],
                energy_consumed=data['energy_consumed'],
                distance_traveled=data['distance_traveled'],
                cost=data['cost'],
                co2_emissions=data.get('co2_emissions', 0),
                notes=data.get('notes')
            )
            log.efficiency = log.distance_traveled / log.energy_consumed if log.energy_consumed > 0 else 0
            
            db.session.add(log)
            db.session.commit()
            return jsonify(log.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

@app.route('/api/energy-summary', methods=['GET'])
@login_required
def energy_summary():
    """Get energy consumption summary"""
    try:
        vehicle_id = request.args.get('vehicle_id')
        days = request.args.get('days', 30, type=int)
        
        query = EnergyLog.query.filter_by(user_id=current_user.id)
        if vehicle_id:
            query = query.filter_by(vehicle_id=vehicle_id)
        
        since = datetime.utcnow() - timedelta(days=days)
        logs = query.filter(EnergyLog.date >= since).all()
        
        total_energy = sum(log.energy_consumed for log in logs)
        total_distance = sum(log.distance_traveled for log in logs)
        total_cost = sum(log.cost for log in logs)
        total_co2 = sum(log.co2_emissions for log in logs)
        avg_efficiency = total_distance / total_energy if total_energy > 0 else 0
        
        return jsonify({
            'total_energy': total_energy,
            'total_distance': total_distance,
            'total_cost': total_cost,
            'total_co2': total_co2,
            'average_efficiency': avg_efficiency,
            'days': days,
            'log_count': len(logs)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ===== STATION FINDER ROUTES =====

@app.route('/api/stations', methods=['GET', 'POST'])
def stations():
    """Get nearby stations or add a new station"""
    if request.method == 'GET':
        station_type = request.args.get('station_type')
        latitude = request.args.get('latitude', type=float)
        longitude = request.args.get('longitude', type=float)
        
        query = Station.query
        if station_type:
            query = query.filter_by(station_type=station_type)
        
        all_stations = query.all()
        
        # Simple distance calculation (can be improved with geopy)
        if latitude and longitude:
            def distance(lat1, lon1, lat2, lon2):
                from math import radians, sin, cos, sqrt, atan2
                R = 6371  # Earth radius in km
                lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
                dlat = lat2 - lat1
                dlon = lon2 - lon1
                a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
                c = 2 * atan2(sqrt(a), sqrt(1-a))
                return R * c
            
            all_stations.sort(key=lambda s: distance(latitude, longitude, s.latitude, s.longitude))
        
        return jsonify([s.to_dict() for s in all_stations[:50]]), 200
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            station = Station(
                name=data['name'],
                latitude=data['latitude'],
                longitude=data['longitude'],
                station_type=data['station_type'],
                address=data.get('address'),
                phone=data.get('phone'),
                price_per_unit=data.get('price_per_unit'),
                open_24_7=data.get('open_24_7', False)
            )
            db.session.add(station)
            db.session.commit()
            return jsonify(station.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

# ===== ROUTE OPTIMIZATION ROUTES =====

@app.route('/api/routes', methods=['GET', 'POST'])
@login_required
def routes():
    """Get routes or create a new route"""
    if request.method == 'GET':
        vehicle_id = request.args.get('vehicle_id')
        query = Route.query
        if vehicle_id:
            query = query.filter_by(vehicle_id=vehicle_id)
        
        all_routes = query.all()
        return jsonify([r.to_dict() for r in all_routes]), 200
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            route = Route(
                vehicle_id=data['vehicle_id'],
                start_location=data['start_location'],
                end_location=data['end_location'],
                distance=data['distance'],
                estimated_energy=data.get('estimated_energy'),
                route_type=data.get('route_type', 'shortest')
            )
            db.session.add(route)
            db.session.commit()
            return jsonify(route.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

# ===== EMERGENCY ROUTES =====

@app.route('/api/emergency-contacts', methods=['GET', 'POST'])
@login_required
def emergency_contacts():
    """Get emergency contacts or add a new one"""
    if request.method == 'GET':
        contacts = EmergencyContact.query.filter_by(user_id=current_user.id).all()
        return jsonify([c.to_dict() for c in contacts]), 200
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            contact = EmergencyContact(
                user_id=current_user.id,
                contact_name=data['contact_name'],
                phone=data['phone'],
                relationship=data.get('relationship'),
                is_primary=data.get('is_primary', False)
            )
            db.session.add(contact)
            db.session.commit()
            return jsonify(contact.to_dict()), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

@app.route('/api/emergency-alert', methods=['POST'])
@login_required
def emergency_alert():
    """Create an emergency alert"""
    try:
        data = request.get_json()
        alert = EmergencyAlert(
            user_id=current_user.id,
            vehicle_id=data.get('vehicle_id'),
            alert_type=data['alert_type'],
            latitude=data.get('latitude'),
            longitude=data.get('longitude'),
            description=data.get('description')
        )
        db.session.add(alert)
        db.session.commit()
        
        # TODO: Send SMS/Email notifications to emergency contacts
        
        return jsonify(alert.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# ===== UTILITY FUNCTIONS FOR DASHBOARD & RANGE CALCULATION =====

def get_unit_for_vehicle_type(vehicle_type):
    """Return energy unit based on vehicle type"""
    if vehicle_type == 'ev':
        return 'kWh'
    elif vehicle_type in ['petrol', 'hybrid']:
        return 'liters'
    elif vehicle_type == 'cnc':
        return 'kg'
    return 'units'

def calculate_remaining_range(vehicle_type, fuel_capacity=None, current_fuel=None, 
                               battery_capacity=None, current_battery=None, efficiency=None):
    """Calculate remaining range based on vehicle type and current fuel/battery levels"""
    result = {}
    
    if vehicle_type == 'ev':
        capacity = battery_capacity or 60
        current = current_battery if current_battery is not None else (capacity * 0.75)
        eff = efficiency or 6
        range_km = int(current * eff)
        result['range_km'] = range_km
        result['details'] = f'{current:.1f} kWh available'
        result['unit'] = 'kWh'
    elif vehicle_type in ['petrol', 'cnc']:
        capacity = fuel_capacity or 50
        current = current_fuel if current_fuel is not None else (capacity * 0.75)
        eff = efficiency or 15
        range_km = int(current * eff)
        result['range_km'] = range_km
        result['details'] = f'{current:.1f} L available'
        result['unit'] = 'L'
    elif vehicle_type == 'hybrid':
        bat_cap = battery_capacity or 20
        fuel_cap = fuel_capacity or 40
        bat_cur = current_battery if current_battery is not None else (bat_cap * 0.75)
        fuel_cur = current_fuel if current_fuel is not None else (fuel_cap * 0.75)
        eff = efficiency or 5
        bat_range = int(bat_cur * eff)
        fuel_range = int(fuel_cur * (efficiency or 12))
        range_km = bat_range + fuel_range
        result['range_km'] = range_km
        result['details'] = f'{bat_cur:.1f} kWh + {fuel_cur:.1f} L'
        result['unit'] = 'hybrid'
    else:
        result['range_km'] = 0
        result['details'] = '--'
        result['unit'] = 'units'
    
    return result

def generate_random_series(length, base, variance):
    """Generate a series of random numbers for mock dashboard data"""
    series = []
    value = base
    for _ in range(length):
        change = (random.random() - 0.5) * variance
        value = max(0, value + change)
        series.append(round(value, 1))
    return series

def generate_mock_dashboard_data(vehicle_type='ev'):
    """Generate mock dashboard metrics for a given vehicle type"""
    unit = get_unit_for_vehicle_type(vehicle_type)
    
    monthly_consumption = round(random.random() * 120 + 80, 1)
    co2 = round(random.random() * 180 + 90)
    savings = round(random.random() * 1200 + 300)
    efficiency_score = round(random.random() * 35 + 60)
    
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
    energy_base = 210 if vehicle_type == 'ev' else 45
    energy_variance = 40 if vehicle_type == 'ev' else 8
    
    energy_data = generate_random_series(len(months), energy_base, energy_variance)
    efficiency_data = generate_random_series(len(months), 72, 10)
    savings_data = generate_random_series(len(months), 800, 250)
    
    return {
        'monthly_consumption': monthly_consumption,
        'co2_emissions': co2,
        'savings': savings,
        'efficiency_score': efficiency_score,
        'unit': unit,
        'months': months,
        'energy_data': energy_data,
        'efficiency_data': efficiency_data,
        'savings_data': savings_data
    }

def generate_mock_forecast_data(vehicle_type='ev'):
    """Generate mock forecast data for price and consumption"""
    unit = get_unit_for_vehicle_type(vehicle_type)
    months = ['Next 1', 'Next 2', 'Next 3', 'Next 4', 'Next 5', 'Next 6']
    
    if vehicle_type == 'petrol':
        price_base = 100
    elif vehicle_type == 'ev':
        price_base = 9
    elif vehicle_type == 'cnc':
        price_base = 70
    else:
        price_base = 50
    
    price_data = generate_random_series(len(months), price_base, 5)
    consumption_base = 220 if vehicle_type == 'ev' else 50
    consumption_data = generate_random_series(len(months), consumption_base, 20)
    
    return {
        'months': months,
        'unit': unit,
        'price_data': price_data,
        'consumption_data': consumption_data
    }

def generate_mock_behavior_data():
    """Generate mock driving behavior snapshot"""
    avg_speed = round(random.random() * 40 + 30)
    harsh_braking = round(random.random() * 8)
    idle_time = round(random.random() * 18 + 5)
    accel_styles = ['Smooth', 'Moderate', 'Aggressive']
    accel_style = random.choice(accel_styles)
    
    return {
        'avg_speed': avg_speed,
        'harsh_braking': harsh_braking,
        'idle_time': idle_time,
        'acceleration_style': accel_style
    }

# ===== NEW DASHBOARD & METRICS ROUTES =====

@app.route('/api/dashboard/metrics', methods=['GET'])
def dashboard_metrics():
    """Get dashboard metrics for the current user's vehicle"""
    try:
        vehicle_type = request.args.get('vehicle_type', 'ev')
        data = generate_mock_dashboard_data(vehicle_type)
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dashboard/forecast', methods=['GET'])
def dashboard_forecast():
    """Get forecast data for price and consumption"""
    try:
        vehicle_type = request.args.get('vehicle_type', 'ev')
        data = generate_mock_forecast_data(vehicle_type)
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dashboard/behavior', methods=['GET'])
def dashboard_behavior():
    """Get mock driving behavior snapshot"""
    try:
        data = generate_mock_behavior_data()
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/vehicle/remaining-range', methods=['POST'])
def vehicle_remaining_range():
    """Calculate remaining range based on vehicle specifications"""
    try:
        data = request.get_json()
        vehicle_type = data.get('vehicle_type')
        fuel_capacity = data.get('fuel_capacity')
        current_fuel = data.get('current_fuel')
        battery_capacity = data.get('battery_capacity')
        current_battery = data.get('current_battery')
        efficiency = data.get('efficiency')
        
        range_result = calculate_remaining_range(
            vehicle_type=vehicle_type,
            fuel_capacity=fuel_capacity,
            current_fuel=current_fuel,
            battery_capacity=battery_capacity,
            current_battery=current_battery,
            efficiency=efficiency
        )
        return jsonify(range_result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/vehicle/unit', methods=['GET'])
def vehicle_unit():
    """Get energy unit for a vehicle type"""
    try:
        vehicle_type = request.args.get('vehicle_type', 'ev')
        unit = get_unit_for_vehicle_type(vehicle_type)
        return jsonify({'unit': unit}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ===== TEMPLATE ROUTES =====

@app.route('/')
def landing():
    """Serve landing page"""
    return render_template('landing.html')

# Serve the main application UI after user clicks "Get Started"
@app.route('/app')
def app_index():
    return render_template('index.html')

@app.route('/dashboard')
@login_required
def dashboard():
    """Serve dashboard (to be created)"""
    return render_template('dashboard.html')

# ===== ERROR HANDLERS =====

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'error': 'Internal server error'}), 500

# ===== DATABASE INITIALIZATION =====

def init_db():
    """Initialize the database"""
    with app.app_context():
        db.create_all()
        
        # Add sample stations if they don't exist
        if Station.query.count() == 0:
            sample_stations = [
                Station(name='Shell Petrol Station', station_type='Petrol', latitude=28.7041, longitude=77.1025, address='Delhi', price_per_unit=95),
                Station(name='EV Charging Hub', station_type='EV_Charging', latitude=28.5355, longitude=77.3910, address='Gurgaon', price_per_unit=12),
                Station(name='Hybrid Station', station_type='Hybrid', latitude=28.6139, longitude=77.2090, address='New Delhi', price_per_unit=85),
            ]
            for station in sample_stations:
                db.session.add(station)
            db.session.commit()
        
        print("Database initialized!")

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)
