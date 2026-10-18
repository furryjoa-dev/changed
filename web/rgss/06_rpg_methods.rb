# RGSS2 런타임에 숨어 있던 RPG 클래스 메서드들
__rpg_class('RPG', 'Class', 'Learning', [:level, :skill_id])
__rpg_class('RPG', 'Troop', 'Member', [:enemy_id, :x, :y, :hidden])

module RPG
  class BGM
    @@last = RPG::BGM.new
    def play
      if @name.nil? || @name.empty?
        Audio.bgm_stop
        @@last = RPG::BGM.new
      else
        Audio.bgm_play('Audio/BGM/' + @name, @volume, @pitch)
        @@last = self.clone
      end
    end
    def replay; play; end
    def self.stop; Audio.bgm_stop; @@last = RPG::BGM.new; end
    def self.fade(time); Audio.bgm_fade(time); @@last = RPG::BGM.new; end
    def self.last; @@last.clone; end
  end

  class BGS
    @@last = RPG::BGS.new
    def play
      if @name.nil? || @name.empty?
        Audio.bgs_stop
        @@last = RPG::BGS.new
      else
        Audio.bgs_play('Audio/BGS/' + @name, @volume, @pitch)
        @@last = self.clone
      end
    end
    def replay; play; end
    def self.stop; Audio.bgs_stop; @@last = RPG::BGS.new; end
    def self.fade(time); Audio.bgs_fade(time); @@last = RPG::BGS.new; end
    def self.last; @@last.clone; end
  end

  class ME
    def play
      if @name.nil? || @name.empty?
        Audio.me_stop
      else
        Audio.me_play('Audio/ME/' + @name, @volume, @pitch)
      end
    end
    def self.stop; Audio.me_stop; end
    def self.fade(time); Audio.me_fade(time); end
  end

  class SE
    def play
      Audio.se_play('Audio/SE/' + @name, @volume, @pitch) unless @name.nil? || @name.empty?
    end
    def self.stop; Audio.se_stop; end
  end

  class UsableItem
    def for_opponent?; [1, 2, 3, 4, 5, 6].include?(@scope); end
    def for_friend?; [7, 8, 9, 10, 11].include?(@scope); end
    def for_dead_friend?; [9, 10].include?(@scope); end
    def for_user?; @scope == 11; end
    def for_one?; [1, 3, 7, 9, 11].include?(@scope); end
    def for_two?; @scope == 5; end
    def for_three?; @scope == 6; end
    def for_random?; [4, 5, 6].include?(@scope); end
    def for_all?; [2, 8, 10].include?(@scope); end
    def need_selection?; [1, 3, 7, 9].include?(@scope); end
    def battle_ok?; [0, 1].include?(@occasion); end
    def menu_ok?; [0, 2].include?(@occasion); end
  end
end
