import { DeviceInfo } from '../modules/session/session.types';

/**
 * Parse device information from User-Agent string
 */
export function parseDeviceInfo(userAgent: string, ip: string): DeviceInfo {
  const ua = userAgent.toLowerCase();

  // Detect device type
  let deviceType: DeviceInfo['deviceType'] = 'unknown';
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    deviceType = 'mobile';
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/mozilla|chrome|safari|firefox|opera/i.test(ua)) {
    deviceType = 'desktop';
  }

  // Detect browser
  let browser = 'Unknown';
  if (ua.includes('edg/')) {
    browser = 'Edge';
  } else if (ua.includes('chrome/')) {
    browser = 'Chrome';
  } else if (ua.includes('firefox/')) {
    browser = 'Firefox';
  } else if (ua.includes('safari/') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    browser = 'Opera';
  }

  // Detect OS
  let os = 'Unknown';
  if (ua.includes('windows nt 10.0')) {
    os = 'Windows 10/11';
  } else if (ua.includes('windows nt 6.3')) {
    os = 'Windows 8.1';
  } else if (ua.includes('windows nt 6.2')) {
    os = 'Windows 8';
  } else if (ua.includes('windows nt 6.1')) {
    os = 'Windows 7';
  } else if (ua.includes('windows')) {
    os = 'Windows';
  } else if (ua.includes('mac os x')) {
    const version = ua.match(/mac os x (\d+[._]\d+)/);
    os = version ? `macOS ${version[1].replace('_', '.')}` : 'macOS';
  } else if (ua.includes('android')) {
    const version = ua.match(/android (\d+(\.\d+)?)/);
    os = version ? `Android ${version[1]}` : 'Android';
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    const version = ua.match(/os (\d+)_(\d+)/);
    os = version ? `iOS ${version[1]}.${version[2]}` : 'iOS';
  } else if (ua.includes('linux')) {
    os = 'Linux';
  }

  return {
    ip,
    userAgent,
    deviceType,
    browser,
    os,
  };
}

/**
 * Get location from IP (placeholder - integrate with GeoIP service)
 */
export async function getLocationFromIP(ip: string): Promise<string | null> {
  // TODO: Integrate with a GeoIP service like MaxMind, ipapi.co, or ip-api.com
  // For now, return null
  if (ip === '::1' || ip === '127.0.0.1') {
    return 'Localhost';
  }
  return null;
}
