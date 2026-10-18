# RGSS2 그래픽 계층: Bitmap / Sprite / Viewport / Plane / Window / Tilemap / Graphics
# 상태(ivar)는 Ruby 쪽에 두고, Graphics.update 때 변경분만 JS 렌더러로 보낸다.

module RGSSLive
  @objs = {}
  def self.reg(o); @objs[o.__h] = o; end
  def self.unreg(o); @objs.delete(o.__h); end
  def self.flush; @objs.each_value { |o| o.__sync }; end
  def self.size; @objs.size; end
end

def __c4(c); c ? [c.red, c.green, c.blue, c.alpha] : [0, 0, 0, 0]; end
def __t4(t); t ? [t.red, t.green, t.blue, t.gray] : [0, 0, 0, 0]; end
def __bh(b); (b && !b.disposed?) ? b.__h : 0; end
def __vh(v); (v && !v.disposed?) ? v.__h : 0; end

# ---------------------------------------------------------------- Bitmap
class Bitmap
  attr_reader :__h, :font
  def initialize(a, b = nil)
    @font = Font.new
    @disposed = false
    if b.nil?
      @__h = $js.call(:bmLoad, a.to_s).to_i
      raise Errno::ENOENT, a.to_s if @__h < 0
    else
      raise RGSSError, 'failed to create bitmap' if a.to_i <= 0 || b.to_i <= 0
      @__h = $js.call(:bmNew, a.to_i, b.to_i).to_i
    end
    @width = $js.call(:bmW, @__h).to_i
    @height = $js.call(:bmH, @__h).to_i
  end

  def self.__from_handle(h)
    o = allocate
    o.instance_variable_set(:@font, Font.new)
    o.instance_variable_set(:@disposed, false)
    o.instance_variable_set(:@__h, h)
    o.instance_variable_set(:@width, $js.call(:bmW, h).to_i)
    o.instance_variable_set(:@height, $js.call(:bmH, h).to_i)
    o
  end

  def dispose
    return if @disposed
    @disposed = true
    $js.call(:bmDispose, @__h)
  end
  def disposed?; @disposed; end
  def width; chk; @width; end
  def height; chk; @height; end
  def rect; chk; Rect.new(0, 0, @width, @height); end
  def font=(f); @font = f; end

  def blt(x, y, src, src_rect, opacity = 255)
    chk
    $js.call(:bmBlt, @__h, x, y, src.__h, src_rect.x, src_rect.y, src_rect.width, src_rect.height, opacity)
  end

  def stretch_blt(dest_rect, src, src_rect, opacity = 255)
    chk
    $js.call(:bmStretch, @__h, dest_rect.x, dest_rect.y, dest_rect.width, dest_rect.height,
             src.__h, src_rect.x, src_rect.y, src_rect.width, src_rect.height, opacity)
  end

  def fill_rect(*a)
    chk
    if a.size == 2 then r, c = a; x, y, w, h = r.x, r.y, r.width, r.height
    else x, y, w, h, c = a end
    $js.call(:bmFill, @__h, x, y, w, h, c.red, c.green, c.blue, c.alpha)
  end

  def clear; chk; $js.call(:bmClear, @__h); end

  def clear_rect(*a)
    chk
    if a.size == 1 then r = a[0]; x, y, w, h = r.x, r.y, r.width, r.height
    else x, y, w, h = a end
    $js.call(:bmClearRect, @__h, x, y, w, h)
  end

  def gradient_fill_rect(*a)
    chk
    if a.size <= 4 then r, c1, c2, v = a; x, y, w, h = r.x, r.y, r.width, r.height
    else x, y, w, h, c1, c2, v = a end
    $js.call(:bmGradient, @__h, x, y, w, h, c1.red, c1.green, c1.blue, c1.alpha,
             c2.red, c2.green, c2.blue, c2.alpha, v ? 1 : 0)
  end

  def get_pixel(x, y)
    chk
    v = $js.call(:bmGet, @__h, x, y).to_i
    Color.new((v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255)
  end

  def set_pixel(x, y, c)
    chk
    $js.call(:bmSet, @__h, x, y, c.red, c.green, c.blue, c.alpha)
  end

  def hue_change(hue); chk; $js.call(:bmHue, @__h, hue); end
  def blur; chk; $js.call(:bmBlur, @__h); end
  def radial_blur(angle, division); chk; $js.call(:bmRadial, @__h, angle, division); end

  def draw_text(*a)
    chk
    if a[0].is_a?(Rect)
      r, str, align = a; x, y, w, h = r.x, r.y, r.width, r.height
    else
      x, y, w, h, str, align = a
    end
    align ||= 0
    str = str.to_s
    f = @font
    c = f.color
    $js.call(:bmText, @__h, x, y, w, h, str, align, f.css_name, f.size, f.bold ? 1 : 0, f.italic ? 1 : 0,
             c.red, c.green, c.blue, c.alpha)
  end

  def text_size(str)
    chk
    str = str.to_s
    f = @font
    w = $js.call(:bmTextW, str, f.css_name, f.size, f.bold ? 1 : 0, f.italic ? 1 : 0).to_f
    Rect.new(0, 0, w.ceil, f.size + 4)
  end

  # 세이브용 (원본 스크립트의 Win32 메모리 복사 대체)
  def __raw
    $js.call(:bmGetRaw, @__h).to_s.unpack1('m')
  end
  def __raw=(bin)
    $js.call(:bmSetRaw, @__h, [bin].pack('m0'))
  end

  private
  def chk; raise RGSSError, 'Disposed bitmap' if @disposed; end
end

# ---------------------------------------------------------------- 표시 객체 공통
class DispBase
  attr_reader :__h
  def __create(kind, vp)
    @__h = $js.call(:objNew, kind, __vh(vp)).to_i
    @__last = nil
    @disposed = false
    RGSSLive.reg(self)
  end
  def dispose
    return if @disposed
    @disposed = true
    $js.call(:objDispose, @__h)
    RGSSLive.unreg(self)
  end
  def disposed?; @disposed; end
  def __sync
    st = __state
    return if st == @__last
    @__last = st
    $js.call(:objUpdate, @__h, JSON.generate(st))
  end
  def update; end
  def __chk; raise RGSSError, 'Disposed object' if @disposed; end
end

def __clamp255(v); v = v.to_i; v < 0 ? 0 : (v > 255 ? 255 : v); end

# ---------------------------------------------------------------- Viewport
class Viewport < DispBase
  attr_accessor :visible, :z, :ox, :oy
  attr_reader :rect, :color, :tone
  def initialize(*a)
    @rect = a[0].is_a?(Rect) ? Rect.new(a[0].x, a[0].y, a[0].width, a[0].height) : Rect.new(*(a.empty? ? [0, 0, 544, 416] : a))
    @visible = true; @z = 0; @ox = 0; @oy = 0
    @color = Color.new(0, 0, 0, 0); @tone = Tone.new(0, 0, 0, 0)
    @flash_color = nil; @flash_duration = 0; @flash_total = 0
    __create('viewport', nil)
  end
  def rect=(r); @rect = r; end
  def color=(c); @color = c; end
  def tone=(t); @tone = t; end
  def flash(color, duration)
    @flash_color = color ? color.dup : nil; @flash_duration = duration; @flash_total = duration
  end
  def update
    @flash_duration -= 1 if @flash_duration > 0
  end
  def __state
    fc = [0, 0, 0, 0]; hide = 0
    if @flash_duration > 0
      if @flash_color
        fc = [@flash_color.red, @flash_color.green, @flash_color.blue, @flash_color.alpha * @flash_duration / @flash_total.to_f]
      else
        hide = 1
      end
    end
    [@visible ? 1 : 0, @rect.x, @rect.y, @rect.width, @rect.height, @z, @ox, @oy,
     *__c4(@color), *__t4(@tone), *fc, hide]
  end
end

# ---------------------------------------------------------------- Sprite
class Sprite < DispBase
  attr_accessor :x, :y, :z, :ox, :oy, :zoom_x, :zoom_y, :angle, :mirror, :bush_depth, :bush_opacity,
                :blend_type, :visible, :viewport
  attr_reader :bitmap, :src_rect, :opacity, :color, :tone
  def initialize(viewport = nil)
    @viewport = viewport
    @bitmap = nil
    @src_rect = Rect.new(0, 0, 0, 0)
    @visible = true
    @x = @y = @z = @ox = @oy = 0
    @zoom_x = @zoom_y = 1.0
    @angle = 0; @mirror = false
    @bush_depth = 0; @bush_opacity = 128
    @opacity = 255; @blend_type = 0
    @color = Color.new(0, 0, 0, 0); @tone = Tone.new(0, 0, 0, 0)
    @flash_color = nil; @flash_duration = 0; @flash_total = 0
    __create('sprite', viewport)
  end
  def bitmap=(b)
    @bitmap = b
    @src_rect = b ? Rect.new(0, 0, b.width, b.height) : Rect.new(0, 0, 0, 0)
  end
  def src_rect=(r); @src_rect = r; end
  def opacity=(v); @opacity = __clamp255(v); end
  def color=(c); @color = c; end
  def tone=(t); @tone = t; end
  def width; @src_rect.width; end
  def height; @src_rect.height; end
  def flash(color, duration)
    @flash_color = color ? color.dup : nil; @flash_duration = duration; @flash_total = duration
  end
  def update
    @flash_duration -= 1 if @flash_duration > 0
  end
  def __state
    fc = [0, 0, 0, 0]; hide = 0
    if @flash_duration > 0
      if @flash_color
        fc = [@flash_color.red, @flash_color.green, @flash_color.blue, @flash_color.alpha * @flash_duration / @flash_total.to_f]
      else
        hide = 1
      end
    end
    [@visible ? 1 : 0, __bh(@bitmap), @src_rect.x, @src_rect.y, @src_rect.width, @src_rect.height,
     @x, @y, @z, @ox, @oy, @zoom_x, @zoom_y, @angle, @mirror ? 1 : 0, @bush_depth, @bush_opacity,
     @opacity, @blend_type, *__c4(@color), *__t4(@tone), *fc, hide, __vh(@viewport)]
  end
end

# ---------------------------------------------------------------- Plane
class Plane < DispBase
  attr_accessor :bitmap, :visible, :z, :ox, :oy, :zoom_x, :zoom_y, :blend_type, :viewport
  attr_reader :opacity, :color, :tone
  def initialize(viewport = nil)
    @viewport = viewport
    @bitmap = nil; @visible = true; @z = 0; @ox = @oy = 0
    @zoom_x = @zoom_y = 1.0; @opacity = 255; @blend_type = 0
    @color = Color.new(0, 0, 0, 0); @tone = Tone.new(0, 0, 0, 0)
    __create('plane', viewport)
  end
  def opacity=(v); @opacity = __clamp255(v); end
  def color=(c); @color = c; end
  def tone=(t); @tone = t; end
  def __state
    [@visible ? 1 : 0, __bh(@bitmap), @z, @ox, @oy, @zoom_x, @zoom_y, @opacity, @blend_type,
     *__c4(@color), *__t4(@tone), __vh(@viewport)]
  end
end

# ---------------------------------------------------------------- Window
class Window < DispBase
  attr_accessor :windowskin, :contents, :viewport, :active, :visible, :arrows_visible, :pause,
                :x, :y, :z, :ox, :oy, :padding, :padding_bottom
  attr_reader :cursor_rect, :width, :height, :opacity, :back_opacity, :contents_opacity, :openness
  def initialize(x = 0, y = 0, w = 0, h = 0)
    @viewport = nil
    @windowskin = nil; @contents = Bitmap.new(1, 1)
    @cursor_rect = Rect.new(0, 0, 0, 0)
    @active = true; @visible = true; @arrows_visible = true; @pause = false
    @x = x; @y = y; @width = w; @height = h; @z = 100; @ox = 0; @oy = 0
    @padding = 16; @padding_bottom = 16
    @opacity = 255; @back_opacity = 255; @contents_opacity = 255; @openness = 255
    __create('window', nil)
  end
  def width=(v); @width = v.to_i; end
  def height=(v); @height = v.to_i; end
  def opacity=(v); @opacity = __clamp255(v); end
  def back_opacity=(v); @back_opacity = __clamp255(v); end
  def contents_opacity=(v); @contents_opacity = __clamp255(v); end
  def openness=(v); @openness = __clamp255(v); end
  def cursor_rect=(r); @cursor_rect = r; end
  def move(x, y, w, h); @x = x; @y = y; @width = w; @height = h; end
  def open?; @openness == 255; end
  def close?; @openness == 0; end
  def update; end
  def __state
    [@visible ? 1 : 0, @x, @y, @width, @height, @z, @ox, @oy, __bh(@windowskin), __bh(@contents),
     @cursor_rect.x, @cursor_rect.y, @cursor_rect.width, @cursor_rect.height,
     @active ? 1 : 0, @arrows_visible ? 1 : 0, @pause ? 1 : 0, @padding, @padding_bottom,
     @opacity, @back_opacity, @contents_opacity, @openness, __vh(@viewport)]
  end
end

# ---------------------------------------------------------------- Tilemap
class Tilemap < DispBase
  attr_accessor :viewport, :visible, :ox, :oy
  attr_reader :bitmaps, :map_data, :passages, :flash_data
  def initialize(viewport = nil)
    @viewport = viewport
    @bitmaps = Array.new(9)
    @map_data = nil; @passages = nil; @flash_data = nil
    @visible = true; @ox = 0; @oy = 0; @anim = 0
    __create('tilemap', viewport)
  end
  def map_data=(t)
    @map_data = t
    $js.call(:tmSetMap, @__h, [t.raw.pack('s*')].pack('m0'), t.xsize, t.ysize, t.zsize)
  end
  def passages=(t)
    @passages = t
    $js.call(:tmSetPass, @__h, [t.raw.pack('s*')].pack('m0'))
  end
  def flash_data=(t); @flash_data = t; end
  def update; @anim += 1; end
  def __state
    [@visible ? 1 : 0, *@bitmaps.map { |b| __bh(b) }, @ox, @oy, @anim / 30, __vh(@viewport)]
  end
end

# ---------------------------------------------------------------- Graphics
module Graphics
  @frame_rate = 60
  @frame_count = 0
  @brightness = 255
  class << self
    attr_accessor :frame_rate, :frame_count
    attr_reader :brightness
    def width; 544; end
    def height; 416; end

    def update
      @frame_count += 1
      @upd_n = (@upd_n || 0) + 1
      load '/exp/exp.rb' if $PROF && @upd_n == 800 && File.exist?('/exp/exp.rb')
      if $PROF && @upd_n == 800 && !File.exist?('/exp/exp.rb')
        GC.start; GC.disable
        ObjectSpace.trace_object_allocations_start
        @alloc_base = $js.call(:wasmMemKB).to_i
      elsif $PROF && @upd_n == 806
        ObjectSpace.trace_object_allocations_stop
        $js.call(:log, "[alloc] wasm grew #{$js.call(:wasmMemKB).to_i - @alloc_base}KB in 6 frames")
        big = []
        ObjectSpace.each_object do |o|
          sz = ObjectSpace.memsize_of(o)
          big << [sz, o.class, ObjectSpace.allocation_sourcefile(o), ObjectSpace.allocation_sourceline(o)] if sz > 4000
        end
        big.sort_by { |b| -b[0] }.first(25).each { |b| $js.call(:log, "[alloc] #{b[0]}B #{b[1]} #{b[2]}:#{b[3]}") }
        GC.enable
      end
      if $PROF
        m0 = $js.call(:wasmMemKB).to_i
        @prof_logic = (@prof_logic || 0) + (m0 - (@prof_last || m0))
        RGSSLive.flush
        m1 = $js.call(:wasmMemKB).to_i
        @prof_flush = (@prof_flush || 0) + (m1 - m0)
      else
        RGSSLive.flush
      end
      if @frame_count % 600 == 0
        g = GC.stat
        extra = ''
        if $PROF
          extra = " malloc_inc=#{g[:malloc_increase_bytes]} allocated=#{g[:total_allocated_objects]} memsize=#{ObjectSpace.memsize_of_all / 1048576}MB calls=#{$js.by.sort_by { |k, v| -v }.first(8).map { |k, v| "#{k}:#{v}" }.join(',')}"
          extra << " pages=#{g[:heap_allocated_pages]} sorted=#{g[:heap_sorted_length]} eden=#{g[:heap_eden_pages]} freed_pages=#{g[:total_freed_pages]} minor=#{g[:minor_gc_count]} major=#{g[:major_gc_count]} oldmalloc=#{g[:oldmalloc_increase_bytes]}"
          extra << " memKB(logic/flush/await)=#{@prof_logic}/#{@prof_flush}/#{@prof_await}"
          @prof_logic = @prof_flush = @prof_await = 0
          if defined?(PROF_ACC)
            top = PROF_ACC.sort_by { |k, v| -v[0] }.first(6).map { |k, v| "#{k}=#{v[0]}KB/#{v[1].round}ms" }
            topt = PROF_ACC.sort_by { |k, v| -v[1] }.first(6).map { |k, v| "#{k}=#{v[1].round}ms" }
            $js.call(:log, "[prof-mem] #{top.join(' ')} | [prof-time] #{topt.join(' ')}")
            PROF_ACC.clear
          end
          $js.by.clear
        end
        $js.call(:log, "[gc] count=#{g[:count]} live=#{g[:heap_live_slots]} objs=#{RGSSLive.size} bitmaps=#{$js.call(:bmCount).to_i}#{extra}")
      end
      $js.call(:frame).await
      if $PROF
        m2 = $js.call(:wasmMemKB).to_i
        @prof_await = (@prof_await || 0) + (m2 - m1)
        @prof_last = m2
      end
    end

    def freeze
      RGSSLive.flush
      $js.call(:gFreeze)
    end

    def transition(duration = 10, filename = '', vague = 40)
      duration = 1 if duration < 1
      $js.call(:gTransBegin, filename.to_s, vague)
      duration.times do |i|
        RGSSLive.flush
        $js.call(:gTransStep, (i + 1).to_f / duration)
        $js.call(:frame).await
      end
      $js.call(:gTransEnd)
    end

    def frame_reset; $js.call(:frameReset); end

    def wait(duration); duration.times { update }; end

    def brightness=(v)
      @brightness = v.to_i.clamp(0, 255)
      $js.call(:gBrightness, @brightness)
    end

    def fadeout(duration)
      duration = 1 if duration < 1
      b0 = @brightness
      duration.times do |i|
        self.brightness = b0 - b0 * (i + 1) / duration
        update
      end
    end

    def fadein(duration)
      duration = 1 if duration < 1
      b0 = @brightness
      duration.times do |i|
        self.brightness = b0 + (255 - b0) * (i + 1) / duration
        update
      end
    end

    def snap_to_bitmap
      RGSSLive.flush
      Bitmap.__from_handle($js.call(:gSnap).to_i)
    end

    def resize_screen(w, h); end
  end
end
