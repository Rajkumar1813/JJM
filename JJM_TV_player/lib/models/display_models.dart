class PlaylistItem {
  final String id;
  final String type; // 'queue', 'image', 'video', 'announcement'
  final String? mediaId;
  final String? mediaUrl;
  final String title;
  final int duration; // seconds
  final int order;
  final String? sha256Hash;

  PlaylistItem({
    required this.id,
    required this.type,
    this.mediaId,
    this.mediaUrl,
    required this.title,
    required this.duration,
    required this.order,
    this.sha256Hash,
  });

  factory PlaylistItem.fromJson(Map<String, dynamic> json) {
    return PlaylistItem(
      id: json['id'] ?? '',
      type: json['type'] ?? 'queue',
      mediaId: json['mediaId'],
      mediaUrl: json['mediaUrl'],
      title: json['title'] ?? '',
      duration: json['duration'] is int ? json['duration'] : int.tryParse(json['duration']?.toString() ?? '15') ?? 15,
      order: json['order'] is int ? json['order'] : int.tryParse(json['order']?.toString() ?? '1') ?? 1,
      sha256Hash: json['sha256Hash'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type,
      'mediaId': mediaId,
      'mediaUrl': mediaUrl,
      'title': title,
      'duration': duration,
      'order': order,
      'sha256Hash': sha256Hash,
    };
  }
}

class ResolvedConfig {
  final String screenId;
  final String screenName;
  final String departmentId;
  final String departmentName;
  final String queueUrl;
  final int staleThresholdSeconds;
  final int configVersion;
  final int mediaManifestVersion;
  final List<PlaylistItem> playlist;
  final Map<String, dynamic> settings;
  final String? announcementTicker;

  ResolvedConfig({
    required this.screenId,
    required this.screenName,
    required this.departmentId,
    required this.departmentName,
    required this.queueUrl,
    this.staleThresholdSeconds = 180,
    this.configVersion = 1,
    this.mediaManifestVersion = 1,
    required this.playlist,
    required this.settings,
    this.announcementTicker,
  });

  factory ResolvedConfig.fromJson(Map<String, dynamic> json) {
    var rawPlaylist = json['playlist'] as List<dynamic>? ?? [];
    List<PlaylistItem> items = rawPlaylist.map((i) => PlaylistItem.fromJson(i as Map<String, dynamic>)).toList();

    return ResolvedConfig(
      screenId: json['screenId'] ?? '',
      screenName: json['screenName'] ?? '',
      departmentId: json['departmentId'] ?? '',
      departmentName: json['departmentName'] ?? '',
      queueUrl: json['queueUrl'] ?? '',
      staleThresholdSeconds: json['staleThresholdSeconds'] is int ? json['staleThresholdSeconds'] : 180,
      configVersion: json['configVersion'] is int ? json['configVersion'] : int.tryParse(json['configVersion']?.toString() ?? '1') ?? 1,
      mediaManifestVersion: json['mediaManifestVersion'] is int ? json['mediaManifestVersion'] : int.tryParse(json['mediaManifestVersion']?.toString() ?? '1') ?? 1,
      playlist: items,
      settings: json['settings'] as Map<String, dynamic>? ?? {},
      announcementTicker: json['settings']?['announcementTicker'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'screenId': screenId,
      'screenName': screenName,
      'departmentId': departmentId,
      'departmentName': departmentName,
      'queueUrl': queueUrl,
      'staleThresholdSeconds': staleThresholdSeconds,
      'configVersion': configVersion,
      'mediaManifestVersion': mediaManifestVersion,
      'playlist': playlist.map((i) => i.toJson()).toList(),
      'settings': settings,
    };
  }
}
